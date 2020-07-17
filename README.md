# homebridge-eightsleep-pod

homebriged plugin for the eightsleep pod

# Installation

```sh
npm i --save homebridge-eightsleep-pod
```

# Usage

Example config, It will show up as a fan in homekit. Rsotation direction controls heating/cooling and fan speed controls the temperature level.

```
"platforms": [
    // This is the config for this plugin
    {
      "platform": "EightSleepPod",
      "email": "email@email.com",
      "password": "mypassword",
      "oauthClient": {
        id: 'clientid....',
        secret: 'clientsecret....'
      }
    }
    // End of the config
  ],
```

# License

MI
