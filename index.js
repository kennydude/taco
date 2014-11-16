var os = require('os')
var fs = require('fs')
var path = require('path')
var crypto = require('crypto')
var child = require('child_process')
var spawn = child.spawn

var basic = require('basic')
var mkdirp = require('mkdirp')
var getport = require('getport')
var through = require('through')
var mongroup = require('mongroup')
var backend = require('git-http-backend')
var readDirFiles = require('read-dir-files')

var express = require("express");
var bodyParser = require("body-parser");

// show debug messages if process.env.DEBUG === taco
var debug = require('debug')('taco')

var EnvParser = require("./lib/envparser.js");

module.exports = Host

function Host(opts, ready) {
	if (!(this instanceof Host)) return new Host(opts, ready)
	var self = this

	this.opts = opts || {}
	var s = require("./servers/" + opts.server);
	this.server = new s();

	// set up default options
	if (!opts.dir) opts.dir = process.cwd()
	this.host = opts.host || 'localhost'
	this.repoDir = opts.repoDir || path.join(opts.dir, 'repos')
	this.workDir = opts.workDir || path.join(opts.dir, 'checkouts')
	this.envDir = opts.envDir || path.join(opts.dir, 'environments')
	this.portsDir = opts.portsDir || path.join(opts.dir, 'ports')
	this.username = opts.username || process.env['USER']
	this.password = opts.password || process.env['PASS']

	this.auth = basic(function (user, pass, callback) {
		if (user === self.username && pass === self.password) return callback(null)
		callback(401)
	})

	this.server.setup(opts, function(err) {
		mkdirp(self.portsDir, function(err) {
			self.readPorts(function(err, ports) {
				if (ready && err) return ready(err)
				self.ports = ports
				ready()
			})
		})
	})
}

Host.prototype.readPorts = function(cb) {
	readDirFiles.read(this.portsDir, function (err, files) {
		if (err) return cb(err)
		Object.keys(files).map(function(name) {
			// parse ports as integers
			files[name] = +files[name].toString()
		})
		cb(null, files)
	})
}

Host.prototype.createServer = function(port){
	var app = express();
	app.set('trust proxy', 'loopback');

	var self = this;
	var reqAuth = function(req, res, next){
		if (!self.username || !self.password) {
			debug('DANGER!!! Host.handle no user/pass set, accepting request');
			return next();
		}
		self.auth(req, res, function (err) {
			if (err) {
				debug('Host.handle auth invalid user/pass', req.ip)
				res.set({'WWW-Authenticate': 'Basic realm="Secure Area"'})
				res.end("401")
				return;
			}
			debug('Host.handle auth success, accepting request')
			req.auth = true;
			return next();
		});
		return next();
	};

    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(bodyParser.json());

    app.get("/", function(req, res){
        res.sendfile(path.join(__dirname, "lib", "app.html"));
    });

    app.get("/taco.png", function(req, res){
        res.sendfile(path.join(__dirname, "taco.png"));
    });

    app.get("/apps", reqAuth, function(req, res){
        fs.readdir(self.portsDir, function(err, files){
            if(err) return res.status(503).json({ status : "fail", "error" : err });
            return res.json({
                "status" : "ok",
                "data" : files
            });
        });
    });

    app.get("/:app/environ", reqAuth, function(req, res){
        var e = new EnvParser();
        e.parse(path.join(self.envDir, req.params.app), function(err){
            if(err) return res.status(503).json({ status : "fail", "error" : err });
            return res.json({
                "status" : "ok",
                "data" : e.data
            });
        });
    });

    app.post("/:app/environ", reqAuth, function(req, res){
        var e = new EnvParser();
        e.parse(path.join(self.envDir, req.params.app), function(err){
            // Failure likely means file not found here
            for(var k in req.body){
                e.data[k] = req.body[k];
            }
            e.save(path.join(self.envDir, req.params.app), function(err){
                if(err) return res.status(503).json({ status : "fail", "error" : err });
                self.monitor(req.params.app, self.checkoutDir(req.params.app), function(){
                    // Restarted!
                    return res.json({ status : "ok" });
                });
            });
        });
    });

    // git stuff {
	app.all( /\/(.*)\.git\/(.*)/, reqAuth, function(req, res){
        // in a typical git push this will get called once for
        // 'info' and then again for 'push'
        function onService(err, service) {
            if (err) {
                var a;
                if (service != null){
                        a = service['action'];
                }
                debug('Host.handle onService ' + a + ' err: ' + err);
                res.setHeader("Content-Type", "application/json");
                res.statusCode = 503;
                return res.end(JSON.stringify({err: err}));
            }

            if (service.action === 'push') {
                service.sideband = service.createBand()
            }

            res.setHeader('content-type', service.type)

            // TODO pluggable url parsing
            var repo = req.params[0] + ".git";
            var dir = path.join(self.repoDir, repo)

            // create-if-not-exists the directory + bare git repo to store the incoming repo
            self.init(dir, function(err, sto, ste) {
                if (err || ste) {
                    var errObj = {err: err, stderr: ste, stdout: sto}
                    var errStr = JSON.stringify(errObj)
                    debug('Host.handle onService ' + service.action + ' init dir err: ' + errStr)
                    return res.end(errStr)
                }

                var serviceStream = service.createStream()

                // shell out to the appropriate `git` command, TODO implement this in pure JS :)
                var ps = spawn(service.cmd, service.args.concat(dir))
                ps.stdout.pipe(serviceStream).pipe(ps.stdin)

                debug('Host.onService spawn ' + service.cmd + ' ' + service.action)

                ps.on('exit', function() {
                    debug('Host.onService spawn ' + service.cmd + ' ' + service.action + ' finished')
                    if (service.action === 'push') {
                        self.handlePush({repo: repo, service: service})
                    }
                })

            })
        };
		var bs = backend(req.url, onService)
		console.log(req.headers)
		req.pipe(bs).pipe(res)
	});
    // } end of git only stuff

	app.listen(port, function(){
		console.log("taco is live on " + port);
	});
};

Host.prototype.init = function(dir, cb) {
	var self = this
	fs.exists(dir, function(exists) {
		if (exists) return cb()
		mkdirp(dir, function(err) {
			if (err) return cb(err)
			debug('Host.init creating new bare repo in ' + dir)
			child.exec('git init --bare', {cwd: dir}, cb)
		})
	})
}

Host.prototype.handlePush = function(push, cb) {
	var self = this
	if (!cb) cb = function noop() {}
	var sideband = push.service.sideband
	var checkoutDir = self.checkoutDir(push.repo)
	var name = self.name(push.repo)
	var portFile = path.join(this.portsDir, name)

	self.update(push, function(err) {
		if (err) {
			sideband.write('checkout error ' + err.message + '\n')
			debug('Host.handlePush update err: ' + err)
			return cb(err)
		}
		prepare()
	})

	function prepare() {
		sideband.write('Received ' + push.repo + '\n')
		sideband.write('Running npm install...\n');
		debug('Host running npm install');
		debug('Host.handlePush prepare start for ' + push.repo)
		self.prepare(checkoutDir, sideband, function(err) {
			if (err) {
				sideband.write('ERROR preparing app: ' + err.message + '\n')
				sideband.end()
				debug('Host.handlePush prepare err: ' + err)
				return cb(err)
			}
			debug('Host.handlePush prepare finished')
			getPort()
		})
	}

	function getPort() {
		fs.readFile(portFile, function(err, buf) {
			if (err) return newPort()
			var port = +buf.toString()
			debug('Host.handlePush getPort read port from portFile: ' + port)
			gotPort(err, port)
		})

		function newPort() {
			getport(function(err, port) {
				if (err) return gotPort(err)

				// check the port cache to make sure another app in mid-deployment
				// hasn't been assigned the port we just got
				var existingPorts = Object.keys(self.ports).map(function(n) { return self.ports[n] })
				if (existingPorts.indexOf(port) > -1) {
					debug('Host.handlePush newPort port already assigned, getting new one')
					return newPort()
				}
				self.ports[name] = port

				debug('Host.handlePush getPort writing new portFile ' + portFile)
				fs.writeFile(portFile, port.toString(), function(err) {
					gotPort(err, port)
				})
			})
		}

		function gotPort(err, port) {
			if (err) {
				sideband.write('ERROR could not get port\n')
				sideband.end()
				debug('Host.handlePush getport err: ' + err)
				return cb(err)
			}
			debug('Host.handlePush getport got port ' + port)
			monitor(port)
		}
	}

	function monitor(port) {
		self.monitor(name, checkoutDir, function(err) {
			if (err) {
				debug('Host.handlePush monitor err: ' + err)
				sideband.write('ERROR could not monitor app: ' + err + '\n')
				sideband.end()
				return cb(err)
			}
			debug('Host.handlePush monitor finished')
			vhost({
				name: name,
				port: port,
				domain: name + '.' + self.host
			})
		})
	}

	function vhost(opts) {
		debug('Host.vhost');
		self.server.vhosts.write(opts, function(err, stdo, stde) {
			// give nginx time to reload config
			debug('Host.vhost finished');
			setTimeout(function() {
				if (err) debug('Host.handlePush vhosts.write err: ' + err)
				else debug('Host.handlePush vhosts.write finished')
				finish(err, opts)
			}, 500)
		})
	}

	function finish(err, opts) {
		if (err) {
			sideband.write('Deploy error! ' + err + '\n')
			sideband.end()
			return cb(err)
		}
		if (opts.domain) sideband.write('Deployed at http://' + opts.domain + '\n')
		else sideband.write('Deployed on port ' + opts.port)
		sideband.end()
		cb()
	}
}

Host.prototype.close = function() {
	this.server.end()
}

Host.prototype.prepare = function(dir, res, cb) {
	var npmi = spawn('npm', ['install', '--verbose'], { cwd : dir })
	//npmi.stdout.pipe(res, { end: false });
	npmi.stdout.pipe(process.stdout)
	//npmi.stderr.pipe(res, { end: false })
	npmi.stderr.pipe(process.stdout)
	npmi.on('exit', function (c) {
		if (c !== 0) return cb(new Error('Non-zero exit code: ' + c))
		cb(null, {code: c})
	})
	npmi.on('error', cb)
}

Host.prototype.monitor = function(name, dir, cb) {
	var self = this
	var confPath = path.join(this.opts.dir, 'mongroup.conf')

	fs.readFile(confPath, 'utf8', function(err, conf) {
		if (err) {
			conf = {
				processes: {}
			}
		} else {
			conf = mongroup.parseConfig(conf)
		}

		if (!conf.logs) conf.logs = path.join(self.opts.dir, 'logs')
		if (!conf.pids) conf.pids = path.join(self.opts.dir, 'pids')

		var portFile = path.join(self.portsDir, name);
		var envFile = path.join(self.envDir, name);

		if (!conf.processes[name])
			conf.processes["taco-" + name] = 'cd ' + dir + ' && ' + 'env $(cat ' + envFile + ' | xargs) ' + 'PORT=$(cat ' + portFile +') npm start'

		var confString = self.serializeConf(conf)

		fs.writeFile(confPath, confString, function(err) {
			if (err) return cb(err)

			mkdirp(conf.logs, function(err) {
				if (err) return cb(err)
				mkdirp(conf.pids, function(err) {
					if (err) return cb(err)
					initGroup()
				})
			})
		})

		function initGroup() {
			var group = new mongroup(conf)

			var procs = ["taco-"+name]

			debug('mongroup: stop');
			group.stop(procs, 'SIGQUIT', function(err) {
				if (err) return cb(err)
				debug('mongroup: start');
				group.start(procs, function(err) {
					if (err) return cb(err)
					cb()
				})
			})
		}
	})

}

Host.prototype.serializeConf = function(conf) {
	var str = ''
	Object.keys(conf.processes).map(function(name) {
		str += name + ' = ' + conf.processes[name] + '\n'
	})
	Object.keys(conf).map(function(name) {
		if (name === 'processes') return
		str += name + ' = ' + conf[name] + '\n'
	})
	return str
}

Host.prototype.checkoutDir = function(repo) {
	return path.join(this.workDir, this.name(repo))
}

Host.prototype.name = function(repo) {
	return repo.split('.git')[0]
}

Host.prototype.update = function (push, cb) {
	var self = this
    debug(this.checkoutDir(push.repo));
	fs.exists(this.checkoutDir(push.repo), function(exists) {
		debug(push.repo + ' exists? ' + exists)
		if (!exists) return self.checkout(push, cb)
		self.pull(push, cb)
	})
}

Host.prototype.checkout = function(push, cb) {
	var self = this;
	var dir = this.checkoutDir(push.repo);
    debug('mkdirp ' + dir);
	mkdirp(dir, init);

	function init (err) {
		if (err) return cb('mkdirp(' + dir + ') failed ' + err);
		debug('mkdirp() ' + dir + ' finished')
		child.exec('git init', {cwd: dir}, function (err, stdo, stde) {
			if (err) return cb(err)
			debug('init() ' + dir + ' finished')
			fetch()
		})
	}

	function fetch () {
		var cmd = [
			'git', 'fetch',
			'file://' + path.resolve(self.repoDir, push.repo),
			push.service.fields.branch
		].join(' ')

		child.exec(cmd, { cwd : dir }, function (err) {
			if (err) return cb(err)
			debug('fetch() ' + dir + ' finished')
			checkout()
		})
	}

	function checkout () {
		var cmd = [
			'git', 'checkout', '-b', push.service.fields.branch, push.service.fields.head
		].join(' ')

		child.exec(cmd, { cwd : dir }, function(err, stdo, stde) {
			cb(err, stdo, stde)
		})
	}

}

Host.prototype.pull = function (push, cb) {
	var self = this
	var dir = this.checkoutDir(this.name(push.repo))
	push.id = push.commit + '.' + Date.now()
	var cmd = [
		'git', 'pull',
		'file://' + path.resolve(self.repoDir, push.repo),
		push.service.fields.branch
	].join(' ')
	debug('Host.pull ' + dir + ': ' + cmd)
	child.exec(cmd, { cwd : dir }, function (err) {
		debug('Host.pull ' + dir + ' done: ' + err)
		if (err) return cb(err)
		cb(null)
	})
}
