import {
  DeviceStatusType,
  SideStatusType,
} from 'eightsleep/dist/cjs/validateDeviceStatus'
import { Levels, Sides } from 'eightsleep/dist/cjs/EightSleepAppApi'

import BaseError from 'baseerr'
import EightSleep from 'eightsleep'
import memoConcurrent from 'memoize-concurrent'

export type OptsType = {
  clientApi: EightSleep
  deviceId: string
}

class MapWithClear<K, V> extends Map<K, V> {
  async clear() {
    Array.from(this.keys()).forEach((key) => this.delete(key))
  }
}

export default class EightSleepPod {
  private readonly clientApi: EightSleep
  private readonly deviceId: string

  private readonly setLevelCache: MapWithClear<
    string,
    { data: Promise<DeviceStatusType>; maxAge: number }
  >

  private readonly setOnOffCache: MapWithClear<
    string,
    { data: Promise<DeviceStatusType>; maxAge: number }
  >

  constructor({ clientApi, deviceId }: OptsType) {
    this.clientApi = clientApi
    this.deviceId = deviceId
    this.setLevelCache = new MapWithClear()
    this.setOnOffCache = new MapWithClear()
  }

  getDeviceStatus = memoConcurrent(() =>
    this.clientApi.getAppApiClient().getDeviceStatus(this.deviceId),
  )

  getStatus = async (side: Sides = Sides.SOLO) => {
    const deviceStatus = await this.getDeviceStatus()
    const sideStatus = deviceStatus[side] as SideStatusType | undefined
    if (!sideStatus) {
      throw new BaseError('invalid deviceStatus', { deviceStatus, side })
    }
    return sideStatus
  }

  turnOn = memoConcurrent(
    async (side: Sides = Sides.SOLO) => {
      return await this.clientApi
        .getAppApiClient()
        .setDeviceSideOn(this.deviceId, side)
    },
    {
      cacheKey: (args) => {
        const cache = this.setOnOffCache
        const key = (args[0] || Sides.SOLO) as string
        const cached:
          | { data: Promise<DeviceStatusType>; maxAge: number }
          | undefined = cache.get(key)
        cache.clear()
        if (cached != null) {
          cache.set(key, cached)
        }
        return key
      },
      cache: this.setOnOffCache,
    },
  )

  turnOff = memoConcurrent(
    async (side: Sides = Sides.SOLO) => {
      return await this.clientApi
        .getAppApiClient()
        .setDeviceSideOff(this.deviceId, side)
    },
    {
      cacheKey: (args) => {
        const cache = this.setOnOffCache
        const key = (args[0] || Sides.SOLO) as string
        const cached:
          | { data: Promise<DeviceStatusType>; maxAge: number }
          | undefined = cache.get(key)
        cache.clear()
        if (cached != null) {
          cache.set(key, cached)
        }
        return key
      },
      cache: this.setOnOffCache,
    },
  )

  async isOn(side: Sides = Sides.SOLO): Promise<boolean> {
    const sideStatus = await this.getStatus(side)
    return sideStatus.currentActivity !== 'off'
  }

  async getLevel(side: Sides = Sides.SOLO) {
    const sideStatus = await this.getStatus(side)
    return sideStatus.currentTargetLevel || 0
  }

  setLevel = memoConcurrent(
    async (side: Sides = Sides.SOLO, level: Levels) => {
      return await this.clientApi
        .getAppApiClient()
        .setDeviceSideLevel(this.deviceId, side, level)
    },
    {
      cacheKey: ([side, level]) => {
        const cache = this.setLevelCache
        const key = `${side || Sides.SOLO}::${level}`
        const cached:
          | { data: Promise<DeviceStatusType>; maxAge: number }
          | undefined = cache.get(key)
        cache.clear()
        if (cached != null) {
          cache.set(key, cached)
        }
        return key
      },
      cache: this.setLevelCache,
    },
  )

  getTemperature = memoConcurrent(
    async () => {
      const hourAgo: Date = (() => {
        const d = new Date()
        d.setHours(d.getHours() - 1)
        return d
      })()
      const json: {
        metrics?: {
          roomTemperature?: { timeseries?: Array<{ value: number }> }
        }
      } = await this.clientApi
        .getAppApiClient()
        .json(
          `v1/devices/${
            this.deviceId
          }/metrics/ambient?granularity=minute&from=${hourAgo.toISOString()}&scope=humidity&scope=roomTemperature`,
          200,
        )
      const timeseries = json.metrics?.roomTemperature?.timeseries
      if (timeseries?.length) {
        return timeseries[timeseries.length - 1].value || 0
      }
      return 0
    },
    {
      maxAge: 3600,
    },
  )
}
