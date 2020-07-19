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

const INACTIVE = 0
const IDLE = 1
const HEATING = 2
const COOLING = 3
type CurrentHeaterCoolerStateType = 0 | 1 | 2 | 3
const AUTO = 0
const HEAT = 1
const COOL = 2
type TargetHeaterCoolerStateType = 0 | 1 | 2
type PositiveLevelsType = 0 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class EightsleepPodPlatformAccessory {
  private service: Service
  private eightSleepPod: EightSleepPod
  private targetHeatCool: 1 | 2 = HEAT

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

    // see https://developers.homebridge.io/#/service/HeaterCooler

    this.service =
      this.accessory.getService(this.platform.Service.HeaterCooler) ||
      this.accessory.addService(this.platform.Service.HeaterCooler)

    // required Characteristics
    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.context.displayName,
    )
    this.service
      .getCharacteristic(this.platform.Characteristic.Active)
      .on('get', this.getActiveState)
      .on('set', this.setActiveState)
    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
      .on('get', this.getCurrentHeaterCoolerState)
    this.service
      .getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
      .on('get', this.getTargetHeaterCoolerState)
      .on('set', this.setTargetHeaterCoolerState)
    this.service
      .getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .on('get', this.getRotationSpeed)
    this.service
      .getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .on('get', (cb) => cb(null, 0))

    // optional Characteristics
    this.service
      .getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .on('get', this.getRotationSpeed)
      .on('set', this.setRotationSpeed)
  }

  getActiveState = async (
    cb: CharacteristicGetCallback<number>,
  ): Promise<void> => {
    try {
      this.platform.log.info('Get Active')
      const side = this.accessory.context.side
      const on = await this.eightSleepPod.isOn(side)
      this.platform.log.info('Get Active ->', on)
      cb(null, on ? 1 : 0)
    } catch (err) {
      this.platform.log.error('Get Active Error ->', err)
      cb(err)
    }
  }

  setActiveState = async (
    active: CharacteristicValue,
    cb: CharacteristicSetCallback,
  ) => {
    try {
      this.platform.log.info('Set Active', active)
      const side = this.accessory.context.side
      if (active) {
        this.platform.log.info('Set Active ->', active)
        await this.eightSleepPod.turnOn(side)
        cb(null, 1)
      } else {
        this.platform.log.info('Set Active ->', active)
        await this.eightSleepPod.turnOff(side)
        cb(null, 0)
      }
    } catch (err) {
      this.platform.log.error('Set Active Error ->', err)
      cb(err)
    }
  }

  getCurrentHeaterCoolerState = async (
    cb: CharacteristicGetCallback<number>,
  ): Promise<void> => {
    try {
      this.platform.log.info('Get CurrentHeaterCoolerState')
      const side = this.accessory.context.side
      const status = await this.eightSleepPod.getStatus(side)
      if (status.currentActivity === 'off') {
        this.platform.log.info('Get CurrentHeaterCoolerState ->', INACTIVE)
        cb(null, INACTIVE)
        return
      }
      if (status.currentTargetLevel === 0) {
        this.platform.log.info('Get CurrentHeaterCoolerState ->', IDLE)
        cb(null, IDLE)
      } else if (status.currentTargetLevel > 0) {
        this.platform.log.info('Get CurrentHeaterCoolerState ->', HEATING)
        cb(null, HEATING)
      } else {
        this.platform.log.info('Get CurrentHeaterCoolerState ->', COOLING)
        cb(null, COOLING)
      }
    } catch (err) {
      this.platform.log.error('Get CurrentHeaterCoolerState Error ->', err)
      cb(err)
    }
  }

  getTargetHeaterCoolerState = async (
    cb: CharacteristicGetCallback<TargetHeaterCoolerStateType>,
  ): Promise<void> => {
    try {
      this.platform.log.info('Get TargetHeaterCoolerState')
      const side = this.accessory.context.side
      const status = await this.eightSleepPod.getStatus(side)
      if (status.currentActivity === 'off') {
        this.platform.log.info('Get TargetHeaterCoolerState ->', AUTO)
        cb(null, AUTO)
        return
      }
      if (status.currentTargetLevel > 0) {
        this.targetHeatCool = HEAT
      } else if (status.currentTargetLevel < 0) {
        this.targetHeatCool = COOL
      }
      this.platform.log.info(
        'Get TargetHeaterCoolerState ->',
        this.targetHeatCool,
      )
      cb(null, this.targetHeatCool)
    } catch (err) {
      this.platform.log.error('Get TargetHeaterCoolerState Error ->', err)
      cb(err)
    }
  }

  setTargetHeaterCoolerState = async (
    state: CharacteristicValue,
    cb: CharacteristicSetCallback,
  ) => {
    try {
      this.platform.log.info('Set TargetHeaterCoolerState', state)
      const side = this.accessory.context.side
      const level: Levels = await this.eightSleepPod.getLevel(side)
      if (state !== AUTO) {
        // ignore auto for now..
        this.targetHeatCool = state as 1 | 2
      }
      if (level === 0) {
        cb(null, this.targetHeatCool)
        return
      }
      const factor = this.targetHeatCool === HEAT ? 1 : -1
      const nextLevel = (level * factor) as Levels
      this.platform.log.info(
        'Set TargetHeaterCoolerState ->',
        state,
        this.targetHeatCool,
        level,
      )
      if (level !== nextLevel) {
        await this.eightSleepPod.setLevel(side, nextLevel)
      }
      cb(null, this.targetHeatCool)
    } catch (err) {
      this.platform.log.error('Set TargetHeaterCoolerState Error ->', err)
      cb(err)
    }
  }

  getRotationSpeed = async (
    cb: CharacteristicGetCallback<PositiveLevelsType>,
  ): Promise<void> => {
    try {
      this.platform.log.info('Get RotationSpeed')
      const side = this.accessory.context.side
      let level: Levels = await this.eightSleepPod.getLevel(side)
      level = Math.abs(level) as PositiveLevelsType
      this.platform.log.info('Get RotationSpeed ->', level)
      cb(null, level)
    } catch (err) {
      this.platform.log.error('Get RotationSpeed Error ->', err)
      cb(err)
    }
  }

  setRotationSpeed = async (
    rotationSpeed: CharacteristicValue,
    cb: CharacteristicSetCallback,
  ) => {
    try {
      this.platform.log.info('Set RotationSpeed', rotationSpeed)
      const side = this.accessory.context.side
      let level: Levels = (Math.round((rotationSpeed as number) / 10) *
        10) as Levels
      const factor = this.targetHeatCool === HEAT ? 1 : -1
      level = (level * factor) as Levels
      this.platform.log.info('Set RotationSpeed ->', rotationSpeed, level)
      await this.eightSleepPod.setLevel(side, level)
      cb(null, Math.abs(level))
    } catch (err) {
      this.platform.log.error('Set RotationSpeed Error ->', err)
      cb(err)
    }
  }
}
