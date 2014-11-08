var nconf = require('nginx-conf').NginxConfFile;
var Vhosts = require('nginx-vhosts');
var debug = require('debug')('taco');
var fs = require("fs");

function Ngnix(){

}

Ngnix.prototype.setup = function(opts, cb){
    var self = this;
    // make sure the nginx.conf has server_names_hash_bucket_size === 64
    var confPath = opts.nginx.conf || '/etc/nginx/nginx.conf';
    debug('Host.setup opening nginx conf ' + confPath);

    nconf.create(confPath, function(err, conf) {
      if (err) return cb(err)
      if (conf.nginx.http.server_names_hash_bucket_size) {
        debug('Host.setup nginx conf already configured correctly');
        return initVhosts();
      }
      conf.nginx.http._add('server_names_hash_bucket_size', '64');
      debug('Host.setup updating nginx conf with new configuration');
      fs.writeFile(confPath, conf.toString(), function(err) {
        if (err) return cb(err);
        initVhosts();
      })
    })

    // make sure nginx is running, start it if not
    function initVhosts() {
      self.vhosts = Vhosts(opts.nginx, function running(isRunning) {
        if (!isRunning) {
          self.vhosts.nginx.start(function(err) {
            if (!err) return
            debug('Host.setup nginx start error ' + err)
            cb(err)
          })
          debug('Host.setup starting nginx...')
        } else {
          debug('Host.setup nginx is running')
          debug('Host.setup reloading nginx configuration...')
          self.vhosts.nginx.reload(function(err, stdo, stde) {
            setTimeout(function() {
              cb(err)
            }, 500)
          })
        }
      })
    }
}

Ngnix.prototype.end = function(){
    this.vhosts.nginx.end();
}

Ngnix.setup = function(vhost, host, cb){
    console.log('Writing taco.conf for nginx...')
    var conf = fs.readFileSync(path.join(__dirname, '..', 'taco.conf')).toString().replace('VHOST', 'taco.' + vhost)
    var remotePath = '/etc/nginx/conf.d/taco.conf'
    var echo = ['echo', "'" + conf + "'", '|', 'ssh']
    var args = hostOverrides.concat([host, "'sudo tee " + remotePath + "'"])
    var cmd = echo.concat(args).join(' ')
    child.exec(cmd, function(err, stdo, stde) {
      process.stderr.write(stde)
      console.log('Wrote taco.conf', {err: err})
      if (cb) cb()
    })
}

module.exports = Ngnix;
