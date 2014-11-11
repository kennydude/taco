var fs = require("fs"),
    path = require("path"),
    mkdirp = require('mkdirp');

function Env(){
    this.data = {};
}

Env.prototype.parse = function(file, cb){
    var self = this;
    fs.readFile(file, function(err, data){
        if(err){
            return cb(err);
        }
        self.data = {};
        var lines = data.toString().split("\n");
        for(var i in lines){
            if(lines[i] == "") continue;
            var k = lines[i].split("=");
            self.data[k[0]] = k[1];
        }
        cb(null);
    });
};

Env.prototype.save = function(file, cb){
    var o = [];
    console.log(this.data);
    for(var k in this.data){
        o.push( k + "=" + this.data[k] );
    }
    mkdirp(path.dirname(file), function(err) {
        if(err) return cb(err);
        fs.writeFile(file, o.join("\n"), function(err){
            if(err) return cb(err);
            cb(null);
        });
    });
}

module.exports = Env;
