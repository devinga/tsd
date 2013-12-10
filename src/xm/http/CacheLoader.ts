///<reference path="../../_ref.d.ts" />
///<reference path="../ObjectUtil.ts" />
///<reference path="../promise.ts" />
///<reference path="../EventLog.ts" />
///<reference path="../hash.ts" />
///<reference path="../typeOf.ts" />
///<reference path="../io/FileUtil.ts" />
///<reference path="../io/Koder.ts" />
///<reference path="HTTPCache.ts" />
/*
 * imported from typescript-xm package
 *
 * Bart van der Schoor
 * https://github.com/Bartvds/typescript-xm
 * License: MIT - 2013
 * */
module xm {
	'use strict';

	var Q = require('q');
	var fs = require('fs');
	var path = require('path');
	var tv4:TV4 = require('tv4');
	var FS:typeof QioFS = require('q-io/fs');
	var HTTP:typeof QioHTTP = require('q-io/http');

	require('date-utils');

	// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

	function getISOString(input:any):string {
		var date:Date;
		if (xm.isDate(input)) {
			date = input;
		}
		else if (xm.isString(input) || xm.isNumber(input)) {
			date = new Date(input);
		}
		return (date ? date.toISOString() : null);
	}

	function distributeDir(base:string, name:string, levels:number, chunk:number = 1):string {
		name = name.replace(/(^[\\\/]+)|([\\\/]+$)/g, '');
		if (levels === 0) {
			return base;
		}
		var arr = [base];
		var steps = Math.max(0, Math.min(name.length - 2, levels * chunk));
		for (var i = 0; i < steps; i += chunk) {
			arr.push(name.substr(i, chunk));
		}
		return path.join.apply(path, arr);
	}

	// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

	export module http {

		// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

		//TODO rework downloader to write directly to disk using streams (maybe drop q-io for downloading)
		// - this may require a switch on whether we want to update disk
		// - see old slimer-js cache downlaoder (request.js + fs.createWriteStream + gunzip )
		// - pipe switched on header: https://gist.github.com/nickfishman/5515364
		// - integrate with CacheOpts.compressStore
		//TODO rework this to allow to keep stale content if we can't get new
		export class CacheLoader {

			static get_object = 'get_object';
			static info_read = 'info_read';
			static cache_read = 'cache_read';
			static cache_write = 'cache_write';
			static cache_remove = 'cache_remove';
			static http_load = 'http_load';
			static local_info_bad = 'local_info_bad';
			static local_info_empty = 'local_info_empty';
			static local_info_malformed = 'local_info_malformed';
			static local_body_bad = 'local_body_bad';
			static local_body_empty = 'local_body_empty';
			static local_cache_hit = 'local_cache_hit';
			static http_cache_hit = 'http_cache_hit';

			cache:HTTPCache;
			request:Request;
			object:CacheObject;
			infoCacheValidator:IObjectValidator;
			bodyCacheValidator:IObjectValidator;
			track:xm.EventLog;

			private _defer:Q.Deferred<CacheObject>;

			constructor(cache:HTTPCache, request:Request) {
				this.cache = cache;
				this.request = request;

				this.bodyCacheValidator = new ChecksumValidator();

				if (this.cache.opts.remoteRead) {
					this.infoCacheValidator = new CacheAgeValidator(this.cache.infoSchema, request.localMaxAge);
				}
				else {
					this.infoCacheValidator = new CacheValidator(this.cache.infoSchema);
				}

				this.object = new CacheObject(request);
				this.object.storeDir = distributeDir(this.cache.storeDir, this.request.key, this.cache.opts.splitKeyDir);

				this.object.bodyFile = path.join(this.object.storeDir, this.request.key + '.raw');
				this.object.infoFile = path.join(this.object.storeDir, this.request.key + '.json');

				this.track = new xm.EventLog('http_load', 'CacheLoader');

				xm.ObjectUtil.lockProps(this, ['cache', 'request', 'object']);
			}

			// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - //

			private canUpdate():boolean {
				if (this.cache.opts.cacheRead && this.cache.opts.remoteRead && this.cache.opts.cacheWrite) {
					return true;
				}
				return false;
			}

			// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - //

			getObject():Q.Promise<CacheObject> {
				//cache/load flow, the clousure  is only called when no matching keyTerm was found (or cache was locked)
				if (this._defer) {
					this.track.skip(CacheLoader.get_object);
					return this._defer.promise;
				}

				this._defer = Q.defer();
				this.track.promise(this._defer.promise, CacheLoader.get_object);

				var cleanup = () => {
					//TODOset timeout
					this._defer = null;
				};

				// check the cache
				this.cacheRead().progress(this._defer.notify).then(() => {
					var useCached = false;
					if (this.object.body && this.object.info) {
						useCached = !this.request.forceRefresh;
						if (useCached && xm.isNumber(this.request.httpInterval)) {
							if (new Date(this.object.info.cacheUpdated).getTime() < Date.now() - this.request.httpInterval) {
								this._defer.notify('auto check update on interval: ' + this.request.url);
								useCached = false;
							}
						}
					}

					if (useCached) {
						this._defer.notify('using local cache: ' + this.request.url);
						this._defer.resolve(this.object);
						return;
					}

					// lets load it
					return this.httpLoad(!this.request.forceRefresh).progress(this._defer.notify).then(() => {
						if (!xm.isValid(this.object.body)) {
							throw new Error('no result body: ' + this.object.request.url);
						}
						this._defer.notify('fetched remote: ' + this.request.url);
						this._defer.resolve(this.object);
					});
				}).fail((err) => {
					this._defer.reject(err);
				}).finally(() => {
					cleanup();
				}).done();

				return this._defer.promise;
			}

			private cacheRead():Q.Promise<void> {
				if (!this.cache.opts.cacheRead) {
					this.track.skip(CacheLoader.cache_read);
					return Q().thenResolve();
				}
				var d:Q.Deferred<void> = Q.defer();
				this.track.promise(d.promise, CacheLoader.cache_read);

				this.readInfo().progress(d.notify).then(() => {
					if (!this.object.info) {
						throw new Error('no or invalid info object');
					}
					try {
						this.infoCacheValidator.assert(this.object);
					}
					catch (err) {
						// either bad or just stale
						this.track.event(CacheLoader.local_info_bad, 'cache-info unsatisfactory', err);
						d.notify('cache info unsatisfactory: ' + err);
						//this.track.logger.inspect(err);
						//TODO rework this to allow to keep stale content if request fails (see note above class)
						throw err;
					}

					return FS.read(this.object.bodyFile, {flags: 'rb'}).then((buffer:NodeBuffer) => {
						if (buffer.length === 0) {
							throw new Error('empty body file');
						}
						this.object.bodyChecksum = xm.sha1(buffer);
						this.object.body = buffer;
					});
				}).then(() => {
					//validate it
					try {
						this.bodyCacheValidator.assert(this.object);
						//valid local cache hit
						this.track.event(CacheLoader.local_cache_hit);
						d.resolve();
						return;
					}
					catch (err) {
						//this is bad
						this.track.error(CacheLoader.local_body_bad, 'cache-body invalid:' + err.message, err);
						this.track.logger.error('cache invalid');
						this.track.logger.inspect(err);
						throw err;
					}
				}).fail((err) => {
					//clean up bad cache
					this.object.info = null;
					this.object.body = null;
					this.object.bodyChecksum = null;

					return this.cacheRemove().then(d.resolve, d.reject, d.notify);
				}).done();

				return d.promise;
			}

			// rtfm: https://www.mobify.com/blog/beginners-guide-to-http-cache-headers/
			private httpLoad(httpCache:boolean = true) {
				if (!this.cache.opts.remoteRead) {
					this.track.skip(CacheLoader.http_load);
					return Q().thenResolve();
				}
				var d:Q.Deferred<void> = Q.defer();
				this.track.promise(d.promise, CacheLoader.http_load);

				// assemble request
				var req = HTTP.normalizeRequest(this.request.url);
				Object.keys(this.request.headers).forEach((key) => {
					req.headers[key] = String(this.request.headers[key]).toLowerCase();
				});

				// set cache headers
				if (this.object.info && this.object.body && httpCache) {
					if (this.object.info.httpETag) {
						req.headers['if-none-match'] = this.object.info.httpETag;
					}
					if (this.object.info.httpModified) {
						//TODO verify/fix date format
						//req.headers['if-modified-since'] = new Date(this.object.info.httpModified).toUTCString();
					}
				}
				// we should always do always do this (fix in streaming update)
				//req.headers['accept-encoding'] = 'gzip, deflate';

				// cleanup
				req = HTTP.normalizeRequest(req);

				if (this.track.logEnabled) {
					this.track.logger.inspect(this.request);
					this.track.logger.inspect(req);
				}
				this.track.start(CacheLoader.http_load);

				d.notify('loading: ' + this.request.url);

				// do the actual request
				var httpPromise = HTTP.request(req).then((res:QioHTTP.Response) => {
					d.notify('status: ' + this.request.url + ' ' + String(res.status));

					if (this.track.logEnabled) {
						this.track.logger.status(this.request.url + ' ' + String(res.status));
						this.track.logger.inspect(res.headers);
					}

					this.object.response = new ResponseInfo();
					this.object.response.status = res.status;
					this.object.response.headers = res.headers;

					if (res.status < 200 || res.status >= 400) {
						this.track.error(CacheLoader.http_load);
						throw new Error('unexpected status code: ' + res.status + ' on ' + this.request.url);
					}
					if (res.status === 304) {
						if (!this.object.body) {
							throw new Error('flow error: http 304 but no local content on ' + this.request.url);
						}
						if (!this.object.info) {
							throw new Error('flow error: http 304 but no local info on ' + this.request.url);
						}
						//cache hit!
						this.track.event(CacheLoader.http_cache_hit);

						this.updateInfo(res, this.object.info.contentChecksum);

						return this.cacheWrite(true);
					}

					if (!res.body) {
						// shouldn't we test
						throw new Error('flow error: http 304 but no local info on ' + this.request.url);
					}
					if (res.body && this.object.info && httpCache) {
						// we send cache headers but we got a body
						// meh!
					}

					return res.body.read().then((buffer:NodeBuffer) => {
						if (buffer.length === 0) {

						}
						var checksum = xm.sha1(buffer);

						if (this.object.info) {
							if (this.object.info.contentChecksum) {
								//xm.assert(checksum === this.object.info.contentChecksum, '{a} !== {b}', checksum, this.object.info.contentChecksum);
							}
							this.updateInfo(res, checksum);
						}
						else {
							this.copyInfo(res, checksum);
						}
						this.object.body = buffer;

						d.notify('complete: ' + this.request.url + ' ' + String(res.status));
						this.track.complete(CacheLoader.http_load);

						return this.cacheWrite(false).progress(d.notify);
					});
				}).then(() => {
					d.resolve();
				}, d.reject).done();

				return d.promise;
			}

			private cacheWrite(cacheWasFresh:boolean):Q.Promise<void> {
				if (!this.cache.opts.cacheWrite) {
					this.track.skip(CacheLoader.cache_write);
					return Q().thenResolve();
				}
				var d:Q.Deferred<void> = Q.defer();
				this.track.promise(d.promise, CacheLoader.cache_write);

				if (this.object.body.length === 0) {
					d.reject(new Error('wont write empty file to ' + this.object.bodyFile));
					return;
				}

				this.cache.infoKoder.encode(this.object.info).then((info:NodeBuffer) => {
					if (info.length === 0) {
						d.reject(new Error('wont write empty info file ' + this.object.infoFile));
						return;
					}
					// assemble some writes
					var write = [];
					if (!cacheWasFresh) {
						if (this.object.body.length === 0) {
							d.reject(new Error('wont write empty body file ' + this.object.bodyFile));
							return;
						}

						write.push(xm.FileUtil.mkdirCheckQ(path.dirname(this.object.bodyFile), true).then(() => {
							return FS.write(this.object.bodyFile, this.object.body, {flags: 'wb'});
						}).then(() => {
							this.track.event(CacheLoader.cache_write, 'written file to cache');
						}));
					}
					else {
						this.track.skip(CacheLoader.cache_write, 'cache was fresh');
					}

					// write info file with udpated data
					write.push(xm.FileUtil.mkdirCheckQ(path.dirname(this.object.infoFile), true).then(() => {
						return FS.write(this.object.infoFile, info, {flags: 'wb'});
					}));

					// track em
					return Q.all(write).fail((err:Error) => {
						this.track.error(CacheLoader.cache_write, 'file write', err);
						//TODO clean things up?
						throw err;
					}).then(() => {
						// ghost stat to fix weird empty file glitch (voodoo)
						return Q.all([
							FS.stat(this.object.bodyFile).then((stat:QioFS.Stats) => {
								if (stat.size === 0) {
									this.track.error(CacheLoader.cache_write, 'written zero body bytes');
									d.notify(new Error('written zero body bytes'));
								}
							}),
							FS.stat(this.object.infoFile).then((stat:QioFS.Stats) => {
								if (stat.size === 0) {
									this.track.error(CacheLoader.cache_write, 'written zero info bytes');
									d.notify(new Error('written zero info bytes'));
								}
							})
						]);
					});
				}).done(d.resolve, d.reject);

				return d.promise;
			}

			private cacheRemove():Q.Promise<void> {
				// maybe less strict check?
				if (!this.canUpdate()) {
					return Q.resolve(null);
				}
				return Q.all([
					this.removeFile(this.object.infoFile),
					this.removeFile(this.object.bodyFile),
				]).then(() => {
					this.track.event(CacheLoader.cache_remove, this.request.url);
				});
			}

			private copyInfo(res:QioHTTP.Response, checksum:string) {
				xm.assertVar(checksum, 'sha1', 'checksum');
				var info:CacheInfo = <CacheInfo>{};
				this.object.info = info;
				info.url = this.request.url;
				info.key = this.request.key;
				info.contentType = res.headers['content-type'];
				info.cacheCreated = getISOString(Date.now());
				info.cacheUpdated = getISOString(Date.now());
				this.updateInfo(res, checksum);
			}

			private updateInfo(res:QioHTTP.Response, checksum:string) {
				var info = this.object.info;
				info.httpETag = (res.headers['etag'] || info.httpETag);
				info.httpModified = getISOString((res.headers['last-modified'] ? new Date(res.headers['last-modified']) : new Date()));
				info.cacheUpdated = getISOString(Date.now());
				info.contentChecksum = checksum;
			}

			// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - //

			private readInfo():Q.Promise<void> {
				var d:Q.Deferred<void> = Q.defer();
				this.track.promise(d.promise, CacheLoader.info_read);

				FS.isFile(this.object.infoFile).then((isFile:boolean) => {
					if (!isFile) {
						return null;
					}
					return FS.read(this.object.infoFile, {flags: 'rb'}).then((buffer:NodeBuffer) => {
						if (buffer.length === 0) {
							this.track.event(CacheLoader.local_info_empty, 'empty info file');
							return null;
						}
						return this.cache.infoKoder.decode(buffer).then((info:CacheInfo) => {
							//TODO do we need this test?
							xm.assert((info.url === this.request.url), 'info.url {a} is not {e}', info.url, this.request.url);
							xm.assert((info.key === this.request.key), 'info.key {a} is not {e}', info.key, this.request.key);

							this.object.info = info;
						}).fail((err) => {
							this.track.event(CacheLoader.local_info_malformed, 'mlaformed info file');
							throw err;
						});
					});
				}).then(() => {
					d.resolve();
				}, d.reject).done();
				return d.promise;
			}

			private removeFile(target:string):Q.Promise<void> {
				var d:Q.Deferred<void> = Q.defer();
				FS.exists(target).then((exists:boolean) => {
					if (!exists) {
						d.resolve();
						return;
					}
					return FS.isFile(target).then((isFile:boolean) => {
						if (!isFile) {
							throw new Error('not a file: ' + target);
						}
						this.track.event(CacheLoader.cache_remove, target);
						return FS.remove(target).then(() => {
							d.resolve();
						});
					});
				}).fail(d.reject).done();

				return d.promise;
			}

			toString():string {
				return this.request ? this.request.url : '<no request>';
			}
		}
	}
}