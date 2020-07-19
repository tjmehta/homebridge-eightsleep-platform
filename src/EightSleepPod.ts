import { Levels, Sides } from 'eightsleep/dist/cjs/EightSleepAppApi'

import BaseError from 'baseerr'
import EightSleep from 'eightsleep'
import { SideStatusType } from 'eightsleep/dist/cjs/validateDeviceStatus'

export type OptsType = {
  clientApi: EightSleep
  deviceId: string
}

export default class EightSleepPod {
  private readonly clientApi: EightSleep
  private readonly deviceId: string

  constructor({ clientApi, deviceId }: OptsType) {
    this.clientApi = clientApi
    this.deviceId = deviceId
  }

  async getStatus(side: Sides = Sides.SOLO) {
    const deviceStatus = await this.clientApi
      .getAppApiClient()
      .getDeviceStatus(this.deviceId)
    const sideStatus = deviceStatus[side] as SideStatusType | undefined
    if (!sideStatus) {
      throw new BaseError('invalid deviceStatus', { deviceStatus, side })
    }
    return sideStatus
  }

  async turnOn(side: Sides = Sides.SOLO) {
    return await this.clientApi
      .getAppApiClient()
      .setDeviceSideOn(this.deviceId, side)
  }

  async turnOff(side: Sides = Sides.SOLO) {
    return await this.clientApi
      .getAppApiClient()
      .setDeviceSideOff(this.deviceId, side)
  }

  async isOn(side: Sides = Sides.SOLO): Promise<boolean> {
    const sideStatus = await this.getStatus(side)
    return sideStatus.currentActivity !== 'off'
  }

  async getLevel(side: Sides = Sides.SOLO) {
    const sideStatus = await this.getStatus(side)
    return sideStatus.currentTargetLevel || 0
  }

  async setLevel(side: Sides = Sides.SOLO, level: Levels) {
    return await this.clientApi
      .getAppApiClient()
      .setDeviceSideLevel(this.deviceId, side, level)
  }

  async getTemperature() {
    const json: {
      metrics?: { roomTemperature?: { timeseries?: Array<{ value: number }> } }
    } = await this.clientApi.json(
      `v1/devices/${this.deviceId}/metrics/ambient?granularity=minute&from=2020-07-17T11:06:01.453Z&scope=humidity&scope=roomTemperature`,
    )
    const timeseries = json.metrics?.roomTemperature?.timeseries
    if (timeseries?.length) {
      return timeseries[timeseries.length - 1].value || 0
    }
    return 0
  }
}
