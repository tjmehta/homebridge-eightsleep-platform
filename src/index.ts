import { API } from 'homebridge'
import { EightSleepPodPlatformPlugin } from './platform'
import { PLATFORM_NAME } from './settings'
import { PlatformPluginConstructor } from 'homebridge'

/**
 * This method registers the platform with Homebridge
 */
export = (api: API) => {
  api.registerPlatform(
    PLATFORM_NAME,
    // @ts-ignore
    EightSleepPodPlatformPlugin as PlatformPluginConstructor,
  )
}
