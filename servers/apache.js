/*
Apache module
*/
var fs = require("fs"),
    path = require("path");
var child = require('child_process');
var debug = require('debug')('taco');
var spawn = child.spawn;

function Apache(){}
function Vhosts(a, conf){
    this.apache = a;
    this.confDir = conf;
}

Apache.prototype.setup = function(opts, cb){
    if(fs.existsSync("/etc/httpd/conf")){
        this.confDir = "/etc/httpd/conf";
    } else if(fs.existsSync("/etc/apache2/")){
        this.confDir = "/etc/apache2/sites-enabled";
    } else{
        console.error("E: Apache configuration not found!!!!");
        throw new Exception("Config not found");
    }

    this.vhosts = new Vhosts(this, this.confDir);
    cb();
}

Apache.prototype.install = function(vhost, host, cb){
    this.setup({ nginx : { conf : null } }, function(){});
    v = new Vhosts(this, this.confDir);
    v.write({
        name : "main",
        domain : 'taco.' + vhost,
        port : 8080,
        install : true
    }, cb);
}

Apache.prototype.reload = function(cb){
    var ps = spawn("service", ["apache2", "reload"]);
    ps.stdout.pipe(process.stdout);
    ps.stderr.pipe(process.stderr);

    debug('Reloading Apache');

    ps.on('exit', function() {
        debug('Reloaded');
    });
};

Vhosts.prototype.config = function(opts){
    return ''
    + '<VirtualHost *:80>\n'
    + '\tServerName '+opts.domain+'\n'
    + '\tProxyVia full\n'
    + '\tProxyPreserveHost On\n'
    + '\tProxyPass / http://127.0.0.1:'+opts.port+'/\n'
    + '\tProxyPassReverse / http://127.0.0.1:'+opts.port+'/\n'
    + '</VirtualHost>'
}

Vhosts.prototype.write = function(opts, cb){
    var self = this;
    var config = opts.config || this.config(opts);
    var confPath = path.join(this.confDir, 'taco-' + opts.name + '.conf');
    fs.writeFile(confPath, config, function(err) {
        if (err) return cb(err)
        self.apache.reload(cb)
    });
}



module.exports = Apache;
