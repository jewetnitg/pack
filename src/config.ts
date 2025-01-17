
declare function __non_webpack_require__(m: string): any;

import * as path from 'path';
import * as constants from './constants.js';
import { MessageError } from '@pika/types';
import { Manifest } from './types.js';
import * as fs from './util/fs.js';
import normalizeManifest from './util/normalize-manifest/index.js';
import BaseReporter from './reporters/base-reporter.js';
import executeLifecycleScript from './util/execute-lifecycle-script.js';
import importFrom from 'import-from';


export interface BuildFlags {
  publish?: boolean;
  out?: string;
  silent?: boolean;
  force?: boolean;
};

export interface GlobalFlags extends BuildFlags {
  cwd?: string;
  pipeline?: string;
  verbose?: boolean;
  json?: boolean;
};

export default class Config {
  cwd: string;
  reporter: BaseReporter;
  _manifest: any;
  manifest: Manifest;
  flags: GlobalFlags;

  constructor(reporter: BaseReporter, cwd: string, flags: GlobalFlags) {
    this.reporter = reporter;
    // Ensure the cwd is always an absolute path.
    this.cwd = path.resolve(cwd || process.cwd());
    this.flags = flags;
  }

  async loadPackageManifest() {
    const loc = path.join(this.cwd, constants.NODE_PACKAGE_JSON);
    if (await fs.exists(loc)) {
      const info = await this.readJson(loc, fs.readJsonAndFile);
      this._manifest = {...info.object};
      this.manifest = await normalizeManifest(info.object, this.cwd, this, true);
      return this.manifest;
    } else {
      return null;
    }
  }

  readJson(loc: string, factory: (filename: string) => Promise<any> = fs.readJson): Promise<any> {
    try {
      return factory(loc);
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new MessageError(this.reporter.lang('jsonError', loc, err.message));
      } else {
        throw err;
      }
    }
  }

  async getDistributions(): Promise<[any, any][]> {
    const raw = this.manifest[`@pika/pack`] || {};
    const override = this.flags.pipeline && JSON.parse(this.flags.pipeline);
    const cwd = this.cwd;
    function cleanRawDistObject(rawVal): false | [any, any] {
      if (Array.isArray(rawVal)) {
        let importStr = (rawVal[0].startsWith('./') ||rawVal[0].startsWith('../')) ? path.join(cwd, rawVal[0]) : rawVal[0];
        return [{...importFrom(cwd, importStr), name: rawVal[0]}, rawVal[1] || {}];
      }
      if (typeof rawVal === 'string') {
        return [{build: ({cwd}) => {
          return executeLifecycleScript({
          // config: this,
          args: [],
          cwd,
          cmd: rawVal,
          isInteractive: false});
        }}, {}];
      }
      if (!rawVal) {
        throw new Error('Cannot be false');
      }
      return false;
    }
    const pipeline: any[] = override || raw.pipeline || [];
    return pipeline.map(cleanRawDistObject).filter(Boolean) as [any, any][];
  }
}

