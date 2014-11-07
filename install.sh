sudo apt-get install -y git build-essential

sudo npm install -g

sudo mkdir /tmp/mon
cd /tmp/mon
curl -L# https://github.com/visionmedia/mon/archive/master.tar.gz | sudo tar zx --strip 1
sudo make install

if [ $USERNAME = "root" ]; then
  cd /root
else
  cd /home/$USERNAME
fi

echo $VHOST > VHOST

sudo npm install mongroup -g
mkdir logs
mkdir pids

if [ ! -f mongroup.conf ]; then
    echo "taco = sudo DEBUG=taco taco -h $VHOST -s $SERVER" > mongroup.conf
    echo "logs = logs" >> mongroup.conf
    echo "pids = pids" >> mongroup.conf
fi

sudo mongroup restart taco
