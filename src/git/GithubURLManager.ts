///<reference path="../_ref.d.ts" />
///<reference path="_ref.d.ts" />
///<reference path="GithubRepo.ts" />
///<reference path="../xm/assertVar.ts" />
///<reference path="../xm/ObjectUtil.ts" />
///<reference path="../xm/KeyValueMap.ts" />
///<reference path="../xm/io/URLManager.ts" />

module git {
	'use strict';

	/*
	 GithubURLManager: url-templates for common urls
	 */
	export class GithubURLManager extends xm.URLManager {

		private _base:string = 'https://github.com/{owner}/{project}';
		private _api:string = 'https://api.github.com/repos/{owner}/{project}';
		private _raw:string = 'https://raw.github.com/{owner}/{project}';

		constructor(repo:GithubRepo) {
			super();
			xm.assertVar(repo, GithubRepo, 'repo');

			this.setVars({
				owner: repo.ownerName,
				project: repo.projectName
			});

			// externalise later
			this.addTemplate('api', this._api);
			this.addTemplate('base', this._base);
			this.addTemplate('raw', this._raw);
			this.addTemplate('rawFile', this._raw + '/{commit}/{+path}');

			xm.ObjectUtil.hidePrefixed(this);
		}

		api():string {
			return this.getURL('api');
		}

		base():string {
			return this.getURL('base');
		}

		raw():string {
			return this.getURL('raw');
		}

		rawFile(commit:string, path:string):string {
			xm.assertVar(commit, 'string', 'commit');
			xm.assertVar(path, 'string', 'path');

			return this.getURL('rawFile', {
				commit: commit,
				path: path
			});
		}
	}
}
