///<reference path="../xm/assertVar.ts" />
///<reference path="GithubURLManager.ts" />

module git {
	'use strict';

	/*
	 GithubRepo: basic github repo info
	 */
	//TODO consider merging api and raw instances to this? maybe bundle in a new class?
	//TODO Object.freeze or make getters of props?
	export class GithubRepo {

		urls:git.GithubURLManager;

		constructor(public ownerName:string, public projectName:string) {
			xm.assertVar(ownerName, 'string', 'ownerName');
			xm.assertVar(projectName, 'string', 'projectName');

			this.urls = new git.GithubURLManager(this);
		}

		getCacheKey():string {
			return this.ownerName + '-' + this.projectName;
		}

		toString():string {
			return this.ownerName + '/' + this.projectName;
		}
	}
}
