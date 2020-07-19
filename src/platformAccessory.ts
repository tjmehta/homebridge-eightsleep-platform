import {
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge'

import { DeviceType } from 'eightsleep/dist/cjs/validateDevice'
import EightSleep from 'eightsleep'
import EightSleepPod from './EightSleepPod'
import { EightSleepPodPlatformPlugin } from './platform'
import { Levels } from 'eightsleep/dist/cjs/EightSleepAppApi'

export { Levels, Sides } from 'eightsleep/dist/cjs/EightSleepAppApi'

type RotationDirectionType = 0 | 1
type PositiveLevelsType = 0 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class EightsleepPodPlatformAccessory {
  private service: Service
  private eightSleepPod: EightSleepPod
  private rotationDirection: RotationDirectionType = 0

  constructor(
    private readonly platform: EightSleepPodPlatformPlugin,
    private readonly accessory: PlatformAccessory,
  ) {
    const device: DeviceType = this.accessory.context.device
    const clientApi = new EightSleep(
      this.accessory.context.clientApiJSON ||
        this.accessory.context.apiClientJSON,
    )
    this.eightSleepPod = new EightSleepPod({
      clientApi,
      deviceId: device.deviceId as string,
    })

    // set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(
        this.platform.Characteristic.Manufacturer,
        'Eightsleep',
      )
      .setCharacteristic(
        this.platform.Characteristic.Model,
        device.sensorInfo?.skuName || 'unknown',
      )
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        device.sensorInfo?.serialNumber || 'unknown',
      )

    // see https://developers.homebridge.io/#/service/Fan

    this.service =
      this.accessory.getService(this.platform.Service.Fan) ||
      this.accessory.addService(this.platform.Service.Fan)

    // required Characteristics
    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.context.displayName,
    )
    this.service
      .getCharacteristic(this.platform.Characteristic.On)
      .on('get', this.getOnState)
      .on('set', this.setOnState)

    // optional Characteristics
    this.service
      .getCharacteristic(this.platform.Characteristic.RotationDirection)
      .on('get', this.getRotationDirection)
      .on('set', this.setRotationDirection)

    this.service
      .getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .on('get', this.getRotationSpeed)
      .on('set', this.setRotationSpeed)
  }

  getOnState = async (
    cb: CharacteristicGetCallback<boolean>,
  ): Promise<void> => {
    try {
      const on = await this.eightSleepPod.isOn()
      cb(null, on)
    } catch (err) {
      cb(err)
    }
  }

  setOnState = async (
    on: CharacteristicValue,
    cb: CharacteristicSetCallback,
  ) => {
    try {
      this.platform.log.debug('Set On ->', on)
      const side = this.accessory.context.side
      if (on) {
        await this.eightSleepPod.turnOn(side)
        cb(null, true)
      } else {
        await this.eightSleepPod.turnOff(side)
        cb(null, false)
      }
    } catch (err) {
      cb(err)
    }
  }

  getRotationDirection = async (
    cb: CharacteristicGetCallback<RotationDirectionType>,
  ): Promise<void> => {
    try {
      const side = this.accessory.context.side
      const on = await this.eightSleepPod.isOn(side)
      const rotationDirection = on
        ? this.platform.Characteristic.RotationDirection.CLOCKWISE
        : this.platform.Characteristic.RotationDirection.COUNTER_CLOCKWISE
      cb(null, rotationDirection)
    } catch (err) {
      cb(err)
    }
  }

  setRotationDirection = async (
    rotationDirection: CharacteristicValue,
    cb: CharacteristicSetCallback,
  ) => {
    try {
      const side = this.accessory.context.side
      this.platform.log.debug('Set RotationDirection ->', rotationDirection)
      this.rotationDirection = rotationDirection as RotationDirectionType
      let level: Levels = await this.eightSleepPod.getLevel(side)
      if (level === 0) {
        cb(null, level)
        return
      }
      const factor = this.rotationDirection - 1
      level = (level * factor) as Levels
      await this.eightSleepPod.setLevel(side, level)
      cb(null, level)
    } catch (err) {
      cb(err)
    }
  }

  getRotationSpeed = async (
    cb: CharacteristicGetCallback<PositiveLevelsType>,
  ): Promise<void> => {
    try {
      const side = this.accessory.context.side
      let level: Levels = await this.eightSleepPod.getLevel(side)
      level = Math.abs(level) as PositiveLevelsType
      cb(null, level)
    } catch (err) {
      cb(err)
    }
  }

  setRotationSpeed = async (
    rotationSpeed: CharacteristicValue,
    cb: CharacteristicSetCallback,
  ) => {
    const side = this.accessory.context.side
    this.platform.log.debug('Set RotationSpeed ->', rotationSpeed)
    try {
      let level: Levels = (Math.round((rotationSpeed as number) / 10) *
        10) as Levels
      const factor = this.rotationDirection - 1
      level = (level * factor) as Levels
      await this.eightSleepPod.setLevel(side, level)
      cb(null, level)
    } catch (err) {
      cb(err)
    }
  }
}
