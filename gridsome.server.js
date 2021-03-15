const chalk = require('chalk')
const crypto = require('crypto')
const fs = require('fs-extra')
const get = require('lodash.get')
const got = require('got').default
const mime = require('mime/lite')
const normalizeUrl = require('normalize-url')
const path = require('path')
const stream = require('stream')
const url = require('url')
const validate = require('validate.js')
const { promisify } = require('util')

const pipeline = promisify(stream.pipeline)

class ImageDownloader {
    constructor(api, options) {

        //no one is perfect, so we check that all required
        //config values are defined in `gridsome.config.js`
        const validationResult = this.validateOptions(options)

        if (validationResult) {
            console.log()
            console.log(`${chalk.yellowBright('Remote images are not downloaded. Please check your configuration.')}`)
            console.log(`${chalk.yellowBright('* '+validationResult.join('\n* '))}`)
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
            const fieldType = this.getFieldType(api, options)
            await this.updateNodes(api, fieldType, this)
        });

    }

    getFieldType(api, options) {
        function recursiveSearch(currentPath, pathToNode, pathIndex = 0) {

            if (currentPath === undefined)
                return null

            if (pathToNode.length === pathIndex)
                return (typeof currentPath).toLowerCase()

            if (currentPath instanceof Array) {
                let type = null
                let index = 0
                do {
                    type = recursiveSearch(currentPath[index], pathToNode, pathIndex)
                    index++
                } while (type == null && index < currentPath.length)
                return type.toLowerCase()
            }

            return recursiveSearch(currentPath[pathToNode[pathIndex]], pathToNode, pathIndex + 1)
        }

        return recursiveSearch (
            api._app.store.getCollection(options.typeName).data(),
            options.sourceField.split(".")
        );
    }

    async updateNodes(api, fieldType, plugin) {
        const collection = api._app.store.getCollection(plugin.options.typeName)

        async function recursiveSearch(currentPath, parentPath, pathToNode, pathIndex = 0) {

            if (currentPath === undefined)
                return

            if (pathToNode.length === pathIndex) {
                let imagePaths = await plugin.getRemoteImage(
                    fieldType === 'string' ? [currentPath] : currentPath,
                    plugin.options
                )

                if( fieldType === 'string' ) {
                    parentPath[pathToNode[pathToNode.length - 1]] = imagePaths[0]
                } else {
                    parentPath[pathToNode[pathToNode.length - 1]] = imagePaths
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
            forceHttps = false, 
            normalizeProtocol = true, 
            defaultProtocol = 'http:', 
            downloadFromLocalNetwork = false, 
            targetPath = 'src/assets/remoteImages', 
            sourceField 
        } = options

        return Promise.all(
            imageSources.map( async imageSource => {

                try {
                // Normalize URL, and extract the pathname, to be used for the original filename if required
                    imageSource = normalizeUrl(imageSource, { 'forceHttps': forceHttps, 'normalizeProtocol': normalizeProtocol, 'defaultProtocol': defaultProtocol })
                } catch(e) {
                    return imageSource
                }

                // Check if we have a local file as source
                var isLocal = validate({ imageSource: imageSource }, { imageSource: { url: { allowLocal: downloadFromLocalNetwork } } })


                // If this is the case, we can stop here and re-using the existing image
                if( isLocal ) {
                    return imageSource
                }
                
                const { pathname } = new URL(imageSource)
                // Parse the path to get the existing name, dir, and ext
                let { name, dir, ext } = path.parse(pathname)

                try {
                    // If there is no ext, we will try to guess from the http content-type
                    if (!ext) {
                        const { headers } = await got.head(imageSource)
                        ext = `.${mime.getExtension(headers['content-type'])}`
                    }
                } catch (e) {
                    console.log('')
                    console.log(`${chalk.yellowBright(`Unable to get image type for ${options.typeName} - Source URL: ${imageSource}`)}`)
                    console.log(`${chalk.redBright(e)}`)
                    return null
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
                    await pipeline(
                        got.stream(imageSource),
                        fs.createWriteStream(filePath)
                    )

                    // Return the complete file path for further use
                    return relativeFilePath
                } catch(e) {
                    console.log('')
                    console.log(`${chalk.yellowBright(`Unable to download image for ${options.typeName} - Source URL: ${imageSource}`)}`)
                    console.log(`${chalk.redBright(e)}`)

                    if (filePath)
                      await fs.unlink(filePath)
                    return null
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
