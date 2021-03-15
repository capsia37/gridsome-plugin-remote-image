# Gridsome Local Image Downloader

This is a Gridsome plugin to download remote images based on @noxify/gridsome-plugin-remote-image

The aim of this plugin is to solve two limitations from the original one.

In this plugin you won't need a target field parameter, because it overwrites the source field. If you need to keep the remote path use the original plugin.

There are also a few more changes:

This plugin uses the String type instead of the Image type. To use it you should set the src attribute of your g-image as follows:

```html
:src="require(`!!assets-loader!@/${object.img}`)"
```

## Install

```sh
npm i @capsia/gridsome-plugin-local-image
```

## Setup

```js
//gridsome.config.js

module.exports = {
  siteName: 'Gridsome',
  plugins: [
    //...
    {
      use: '@capsia/gridsome-plugin-local-image',
      options: {
        'typeName' : 'Entry',
        'sourceField': 'object.img',
        'targetPath': './src/assets/remoteImages'
      }
    },
    {
      use: '@capsia/gridsome-plugin-local-image',
      options: {
        'typeName' : 'Entry',
        'sourceField': 'remoteImages',
        'targetPath': './src/assets/remoteImages'
      }
    }
  ]
  //...
}
```

## Documentation

You can find more info at the original documentation:

https://webstone.info/documentation/gridsome-plugin-remote-image
