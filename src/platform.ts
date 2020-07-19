import {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  PlatformPluginConstructor,
  Service,
} from 'homebridge'
import { EightsleepPodPlatformAccessory, Sides } from './platformAccessory'
import { PLATFORM_NAME, PLUGIN_NAME } from './settings'

import { DeviceType } from 'eightsleep/dist/cjs/validateDevice'
import EightSleep from 'eightsleep'

export interface EightSleepPodPlatformPluginConfig extends PlatformConfig {
  email: string
  password: string
}

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
// @ts-ignore
export class EightSleepPodPlatformPlugin
  implements DynamicPlatformPlugin, PlatformPluginConstructor {
  public readonly Service: typeof Service = this.api.hap.Service
  public readonly Characteristic: typeof Characteristic = this.api.hap
    .Characteristic

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = []
  private clientApi: EightSleep

  constructor(
    public readonly log: Logger,
    public readonly config: EightSleepPodPlatformPluginConfig,
    public readonly api: API,
  ) {
    this.log.debug('Initializing platform:', this.config.name)
    if (this.accessories.length) {
      const clientApiJSON = this.accessories[0].context.clientApiJSON
      if (
        this.config.email === clientApiJSON.email &&
        this.config.password === clientApiJSON.password &&
        (!this.config.oauthClient?.id ||
          this.config.oauthClient.id === clientApiJSON.oauthClient?.id) &&
        (!this.config.oauthClient?.secret ||
          this.config.oauthClient.secret === clientApiJSON.oauthClient?.secret)
      ) {
        this.clientApi = new EightSleep(clientApiJSON)
      }
    }
    this.clientApi =
      // @ts-ignore
      this.clientApi ||
      new EightSleep({
        email: this.config.email,
        password: this.config.password,
        oauthClient: this.config.oauthClient,
      })

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', async () => {
      this.log.debug('Executed didFinishLaunching callback')
      // run the method to discover / register your devices as accessories
      await this.discoverDevices()
    })
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName)

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory)
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async discoverDevices() {
    await this.clientApi.login()
    const me = await this.clientApi.getMe()
    const devices: Array<DeviceType> = await Promise.all(
      me.devices.map((id) => this.clientApi.getDevice(id)),
    )
    const allAccessoryIds = new Set<string>()
    devices.forEach((device) => {
      const isSplitBed = device.leftUserId !== device.rightUserId
      const bedIds: Array<string> = isSplitBed
        ? [
            `${device.deviceId as string}:left`,
            `${device.deviceId as string}:right`,
          ]
        : [`${device.deviceId as string}:both`]

      // generate a unique id for the accessory this should be generated from
      // something globally unique, but constant, for example, the device serial
      // number or MAC address
      const accessoryIds = bedIds.map((id) => this.api.hap.uuid.generate(id))

      accessoryIds.forEach((accessoryId, i) => {
        allAccessoryIds.add(accessoryId)

        const side =
          accessoryIds.length === 1
            ? Sides.SOLO
            : i === 0
            ? Sides.LEFT
            : Sides.RIGHT
        const displayName =
          accessoryIds.length === 1 ? 'Pod' : i === 0 ? 'Pod Left' : 'Pod Right'

        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find(
          (accessory) => accessory.UUID === accessoryId,
        )

        if (existingAccessory) {
          // the accessory already exists
          this.log.info('Restoring existing accessory from cache:', displayName)

          // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
          existingAccessory.context.clientApiJSON = this.clientApi.toJSON()
          existingAccessory.context.device = device
          existingAccessory.context.displayName = displayName
          existingAccessory.context.side = side
          this.api.updatePlatformAccessories([existingAccessory])

          // create the accessory handler for the restored accessory
          // this is imported from `platformAccessory.ts`
          new EightsleepPodPlatformAccessory(this, existingAccessory)
          return
        }

        // add newly discovered accessory

        // the accessory does not yet exist, so we need to create it
        this.log.info('Adding new accessory:', displayName)

        // create a new accessory
        const accessory = new this.api.platformAccessory(
          displayName,
          accessoryId,
        )

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.clientApiJSON = this.clientApi.toJSON()
        accessory.context.device = device
        accessory.context.displayName = displayName
        accessory.context.side = side

        // create the accessory handler for the newly create accessory
        // this is imported from `platformAccessory.ts`
        new EightsleepPodPlatformAccessory(this, accessory)

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory,
        ])
      })
    })

    const removedAccessories = this.accessories.filter(
      ({ UUID }) => !allAccessoryIds.has(UUID),
    )
    removedAccessories.forEach((removedAccessory) =>
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
        removedAccessory,
      ]),
    )
  }
}
