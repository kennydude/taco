# taco

a taco themed Heroku clone. warning: still alpha-quality

![taco.png](taco.png)

## quickstart

taco is designed to install onto a brand new ubuntu 13.04 64bit install

here's the recommended way to try it out:

- get a digital ocean account, add your ssh key
- create a new ubuntu 13.04 droplet, make sure it includes your ssh key
- buy some domain name and set up two A records pointing at the droplets IP:

```
*.yourdomain.com -> IP
yourdomain.com -> IP
```

- install and run these on your local machine:

```
npm install taco install-node-on-ubuntu install-nginx-on-ubuntu -g
install-nginx-on-ubuntu root@yourdomain.com
install-node-on-ubuntu root@yourdomain.com
install-taco-on-ubuntu root@yourdomain.com yourdomain.com
```

- deploy your first app.

- apps must have `npm install` and `npm start` as the only two setup steps
- they must also listen on `process.env.PORT`

here is an example app: https://github.com/maxogden/hello-world-server.git

to deploy the example:

```
git clone https://github.com/maxogden/hello-world-server.git
cd hello-world-server
git remote add mydomain http://mydomain.com:8080/hello.git
```

right now taco listens for git pushes on :8080

the end of the remote url should be `app-subdomain.git`, so in this case the app
will deploy to `hello.mydomain.com`

now you just need to push:

```
git push origin mydomain
Counting objects: 38, done.
Delta compression using up to 4 threads.
Compressing objects: 100% (26/26), done.
Writing objects: 100% (38/38), 3.45 KiB | 0 bytes/s, done.
Total 38 (delta 4), reused 0 (delta 0)
remote: received hello.git
remote: running npm install...
remote: npm http GET https://registry.npmjs.org/hat/0.0.3
remote: npm http 304 https://registry.npmjs.org/hat/0.0.3
remote: hat@0.0.3 node_modules/hat
remote: deployed app at hello.yourdomain.com
To http://mydomain.com:8080/hello.git
 * [new branch]      master -> master
```
