#!/usr/bin/env node
var taco = require('./')
var http = require('http')
var port = process.env.PORT || 8080;

var program = require('commander');

program
    .version("1.6.0")
    .option("-h --host [host]", "Hostname to use")
    .option("-d --config-dir [conf]", "Configuration directory for server")
    .option("-c --conf [conf]", "Configuration file for server (Might not be needed)")
    .option("-s --server [server]", "Server to use")
    .option("-p --pid-location", "Location of the PID to use")
    .parse(process.argv);

var opts = {
  dir: process.cwd(),
  host: program.host || 'test.local',
  nginx: {
    confDir: program.configDir || '/etc/nginx/conf.d/',
    conf: program.conf || '/etc/nginx/nginx.conf',
    pidLocation: program.pidLocation || '/var/run/nginx.pid'
  },
  server : program.server || 'ngnix'
}

var host = taco(opts, function ready(err) {
  http.createServer(host.handle.bind(host)).listen(port, function() {
    console.log('listening on', port)
  })
})
