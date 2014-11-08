/*
Apache module
*/
var fs = require("fs");

function Apache(){}
function Vhosts(){}

Apache.prototype.setup = function(opts, cb){
    this.confPath = opts.nginx.conf || null;
    if(!this.confPath){
        if(fs.existsSync("/etc/httpd/conf")){
            this.confPath = "/etc/httpd/conf";
        } else if(fs.existsSync("/etc/apache2/")){
            this.confPath = "/etc/apache2/conf-enabled";
        } else{
            console.error("E: Apache configuration not found!!!!");
        }
    }

    this.vhosts = new Vhosts();
}

Apache.install = function(vhost, host, cb){
    v = new Vhosts();
    v.write({
        name : "main",
        domain : 'taco.' + vhost,
        port : 8080
    }, cb);
}

Vhosts.prototype.config = function(opts){
    return ''
    + '<VirtualHost *>\n'
    + 'ServerName '+opts.domain+'\n'
    + 'ProxyPass http://127.0.0.1:'+opts.port+'/\n'
    + 'ProxyPassReverse http://127.0.0.1:'+opts.port+'/\n'
    + '</VirtualHost>'
}

Vhosts.prototype.write = function(opts, cb){
    var self = this;
    var config = opts.config || this.config(opts);
    var confPath = path.join(this.confDir, 'taco-' + opts.name + '.conf');
    fs.writeFile(confPath, config, function(err) {
        if (err) return cb(err)
        self.nginx.reload(cb)
    });
}

module.exports = Apache;
