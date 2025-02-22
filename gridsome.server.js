const crypto = require('crypto')
const fs = require('fs-extra')
const axios = require('axios')
const mime = require('mime/lite')
const path = require('path')
const url = require('url')
const validate = require('validate.js')

class ImageDownloader {
    constructor(api, options) {

        //no one is perfect, so we check that all required
        //config values are defined in `gridsome.config.js`
        const validationResult = this.validateOptions(options)

        if (validationResult) {
            console.log()
            console.log('Remote images are not downloaded. Please check your configuration.')
            console.log('* '+validationResult.join('\n* '))
            console.log()

            return null
        }

        this.options = options
        this.api = api

        //create a new type `Images` which is required
        //for array support
        //also add a new field to the defined collection
        //to store the downloaded images
        api.createSchema(async ({}) => {
            await this.updateNodes(api, this)
        });
    }

    async updateNodes(api, plugin) {
        const collection = api._app.store.getCollection(plugin.options.typeName)

        async function recursiveSearch(currentPath, parentPath, pathToNode, pathIndex = 0) {

            if (!currentPath)
                return

            if (pathToNode.length === pathIndex) {

                if( (typeof currentPath).toLowerCase() === 'string' ) {
                    let imagePaths = await plugin.getRemoteImage( [currentPath], plugin.options )
                    parentPath[pathToNode[pathToNode.length - 1]] = imagePaths[0]
                } else if (currentPath instanceof Array){
                    let imagePaths = await plugin.getRemoteImage( currentPath, plugin.options )
                    parentPath[pathToNode[pathToNode.length - 1]] = imagePaths
                } else {
                    console.log("Unrecognised field: "+(typeof currentPath).toLowerCase())
                }

                return
            }

            if (currentPath instanceof Array) {
                for (let el of currentPath) {
                  await recursiveSearch(el, currentPath, pathToNode, pathIndex)
                }
                return
            }

            return recursiveSearch(currentPath[pathToNode[pathIndex]], currentPath, pathToNode, pathIndex + 1)
        }

        await recursiveSearch (
            collection.data(),
            null,
            plugin.options.sourceField.split(".")
        );
    }

    async getRemoteImage ( imageSources, options ) {
        // Set some defaults
        const { 
            cache = true, 
            original = false, 
            downloadFromLocalNetwork = false, 
            targetPath = 'src/assets/remoteImages', 
            fallbackImage = false, 
            sourceField 
        } = options

        return Promise.all(
            imageSources.map( async imageSource => {

                // Check if we have a local file as source
                var isLocal = validate({ imageSource: imageSource }, { imageSource: { url: { allowLocal: downloadFromLocalNetwork } } })


                // If this is the case, we can stop here and re-using the existing image
                if( isLocal ) {
                    return imageSource
                }
                
                const { pathname } = new URL(imageSource)
                // Parse the path to get the existing name, dir, and ext
                let { name, dir, ext } = path.parse(pathname)

                // If there is no ext, we will try to guess from the http content-type
                if (!ext) {
                    try {
                        const { headers } = await axios.head(imageSource)
                        ext = `.${mime.getExtension(headers['content-type'])}`
                    } catch (e) {
                        console.log('')
                        console.log(`Unable to get image type for ${options.typeName} - Source URL: ${imageSource}`)
                        console.log(e)
                        return fallbackImage ? fallbackImage : imageSource
                    }
                }

                // Build the target file name - if we want the original name then return that, otherwise return a hash of the image source
                const targetFileName = original ? name : crypto.createHash('sha256').update(imageSource).digest('hex')
                // Build the target folder path - joining the current dir, target dir, and optional original path
                const targetFolder = path.join(process.cwd(), targetPath, original ? dir : '')
                // Build the file path including ext & dir
                const filePath = path.format({ ext, name: targetFileName, dir: targetFolder })
                const relativeFilePath = path.relative(path.join(process.cwd(), "src"), filePath)


                try {
                    // If cache = true, and file exists, we can skip downloading
                    if (cache && await fs.exists(filePath)) return relativeFilePath

                    // Otherwise, make sure the file exists, and start downloading with a stream
                    await fs.ensureFile(filePath)
                    // This streams the download directly to disk, saving Node temporarily storing every single image in memory
                    let imageDownload = await axios.get(imageSource, {
                      responseType: 'stream'
                    })
                    imageDownload.data.pipe(fs.createWriteStream(filePath))

                    // Return the complete file path for further use
                    return relativeFilePath
                } catch(e) {
                    console.log('')
                    console.log(`Unable to download image for ${options.typeName} - Source URL: ${imageSource}`)

                    if (filePath)
                      await fs.unlink(filePath)
                    return fallbackImage ? fallbackImage : imageSource
                }
            })
        )
    }

    /**********************
     * Helpers
     **********************/

    validateOptions(options = {}) {
        const contraintOption = {
            presence: {
                allowEmpty: false
            }
        };

        const constraints = {
            typeName: contraintOption,
            sourceField: contraintOption
        };

        const validationResult = validate(options, constraints, {
            format: 'flat'
        })

        return validationResult
    }
}

module.exports = ImageDownloader
