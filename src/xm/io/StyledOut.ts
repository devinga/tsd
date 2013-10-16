/// <reference path="../ObjectUtil.ts" />
/// <reference path="../assertVar.ts" />
/// <reference path="styler.ts" />
/// <reference path="writer.ts" />

module xm {

	var util = require('util');

	/*
	 StyledOut: composite log text writer with semantic chainable api and swappable components (unfunkable)

	 wraps any xm.styler.Styler and xm.writer.TextWriter
	 */
	//TODO implement sub printer flow controls (indents, buffers, tables etc)
	//TODO leverage (yet unimplemented) LineWriter indent level and word wrap
	//TODO implement diff (string / object) (extract and re-implement format from mocha-unfunk-reporter)
	//TODO implement feature to remember if last input closed a line (or otherwise close it)
	export class StyledOut {

		private _styler:xm.styler.Styler;
		private _writer:xm.writer.TextWriter;

		constructor(writer:xm.writer.TextWriter = null, styler:xm.styler.Styler = null) {
			this._writer = (writer || new xm.writer.ConsoleLineWriter());
			this._styler = (styler || new xm.styler.ANSIStyler());

			this._writer.start();

			xm.ObjectUtil.hidePrefixed(this);
		}

		// - - - - - core (inline) - - - - -

		write(str:any):StyledOut {
			this._writer.write(this._styler.plain(str));
			return this;
		}

		// - - - - - core (line end) - - - - -

		line(str:any = ''):StyledOut {
			this._writer.writeln(this._styler.plain(str));
			return this;
		}

		//short sugar
		ln():StyledOut {
			this._writer.writeln(this._styler.zero());
			return this;
		}

		// - - - - - semantic wrappers - - - - -

		span(str:any):StyledOut {
			this._writer.write(this._styler.plain(str));
			return this;
		}

		block(str:any):StyledOut {
			this._writer.writeln(this._styler.plain(str));
			return this;
		}

		clear():StyledOut {
			this._writer.writeln(this._styler.zero());
			this._writer.writeln(this._styler.zero());
			return this;
		}

		ruler():StyledOut {
			this._writer.writeln('--------');
			return this;
		}

		ruler2():StyledOut {
			this._writer.writeln('----');
			return this;
		}

		h1(str:any):StyledOut {
			this._writer.writeln(this._styler.accent(str));
			this.ruler();
			this._writer.writeln();
			return this;
		}

		h2(str:any):StyledOut {
			this._writer.writeln(this._styler.accent(str));
			this.ruler();
			return this;
		}

		// - - - - - decoration styling (inline) - - - - -

		plain(str:any):StyledOut {
			this._writer.writeln(this._styler.plain(str));
			return this;
		}

		accent(str:any):StyledOut {
			this._writer.write(this._styler.accent(str));
			return this;
		}

		// - - - - - layout (inline) - - - - -

		space():StyledOut {
			this._writer.write(this._styler.plain(' '));
			return this;
		}

		// - - - - - status styling (inline) - - - - -

		success(str:any):StyledOut {
			this._writer.write(this._styler.success(str));
			return this;
		}

		warning(str:any):StyledOut {
			this._writer.write(this._styler.warning(str));
			return this;
		}

		error(str:any):StyledOut {
			this._writer.write(this._styler.error(str));
			return this;
		}

		// - - - - - status finalisation (line end) - - - - -

		//like success() but with emphasis and newline
		ok(str:any):StyledOut {
			this._writer.writeln(this._styler.ok(str));
			return this;
		}

		//like warning() but with emphasis and newline
		warn(str:any):StyledOut {
			this._writer.writeln(this._styler.warn(str));
			return this;
		}

		//like error() but with emphasis and newline
		fail(str:any):StyledOut {
			this._writer.writeln(this._styler.fail(str));
			return this;
		}

		// - - - - - handy utils - - - - -

		cond(condition:boolean, str:any, alt?:any):StyledOut {
			if (condition) {
				this._writer.write(this._styler.plain(str));
			}
			else if (arguments.length > 2) {
				this._writer.write(this._styler.plain(alt));
			}
			return this;
		}

		inspect(value:any, depth:number = 4, showHidden:boolean = false):StyledOut {
			this._writer.writeln(this._styler.plain(util.inspect(value, <any>{showHidden: showHidden, depth: depth})));
			return this;
		}

		//activate super-plain mode
		unfunk():StyledOut {
			this.useStyler(new xm.styler.NoStyler());
			return this;
		}

		// - - - - - extra api - - - - -

		//flush writer
		//TODO drop finalise() cargo-cult artifact? (could be usefull although migt as well go through .writer reference)
		finalise():void {
			this._writer.finalise();
		}

		useWriter(writer:xm.writer.TextWriter):xm.StyledOut {
			//beh, no interface check
			xm.assertVar(writer, 'object', 'writer');
			this._writer.finalise();
			this._writer = writer;
			this._writer.start();
			return this;
		}

		useStyler(styler:xm.styler.Styler):xm.StyledOut {
			//beh, no interface check
			xm.assertVar(styler, 'object', 'styler');
			this._styler = styler;
			return this;
		}

		get writer():xm.writer.TextWriter {
			return this._writer;
		}

		get styler():xm.styler.Styler {
			return this._styler;
		}
	}
}
