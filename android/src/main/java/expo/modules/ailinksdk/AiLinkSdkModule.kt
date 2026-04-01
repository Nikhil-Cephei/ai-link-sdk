package expo.modules.ailinksdk

import android.util.Log
import cn.net.aicare.modulelibrary.module.heightBodyFatScale.HeightBodyFatBleData
import cn.net.aicare.modulelibrary.module.heightBodyFatScale.HeightBodyFatBleUntils
import cn.net.aicare.modulelibrary.module.heightBodyFatScale.OnHeightBodyFatListener
import cn.net.aicare.modulelibrary.module.heightBodyFatScale.HeightBodyFatBleBodyModel
import com.pingwang.bluetoothlib.AILinkBleManager
import com.pingwang.bluetoothlib.AILinkSDK
import com.pingwang.bluetoothlib.bean.BleValueBean
import com.pingwang.bluetoothlib.bean.SendMcuBean
import com.pingwang.bluetoothlib.config.BleConfig
import com.pingwang.bluetoothlib.device.BleSendCmdUtil
import com.pingwang.bluetoothlib.listener.OnBleDeviceDataListener
import com.pingwang.bluetoothlib.listener.OnCallbackBle
import com.pingwang.bluetoothlib.utils.BleDataUtils
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val TAG = "AiLinkSdkModule"

class AiLinkSdkModule : Module(), OnCallbackBle, OnHeightBodyFatListener {

    private val applicationContext get() = requireNotNull(appContext.reactContext?.applicationContext)

    private var isScanning = false

    /** Maps MAC → BleValueBean, populated during scan. */
    private val deviceBeanMap = mutableMapOf<String, BleValueBean>()

    /** Current connected device MAC address. */
    private var connectedMac: String? = null

    /** CID (device type) from first onNotifyData; required for SendMcuBean commands. */
    private var deviceCid: Int = 0

    /** Height Body Fat Scale data parser (parsing library). */
    private val hbfParser = HeightBodyFatBleData()

    // ── BLE device data listener ───────────────────────────────────────────────
    private val dataListener = object : OnBleDeviceDataListener {
        override fun onNotifyData(uuid: String?, hex: ByteArray?, type: Int) {
            if (deviceCid == 0 && type != 0) deviceCid = type

            sendEvent(
                "onNotifyData", mapOf(
                    "uuid" to (uuid ?: ""),
                    "data" to (hex?.map { it.toInt() and 0xFF } ?: emptyList<Int>()),
                    "type" to type
                )
            )
            // Feed raw bytes to the parsing library
            hex?.let { hbfParser.parseData(it, type) }
        }

        override fun onNotifyDataA6(uuid: String?, hex: ByteArray?) {
            val bytes = hex ?: return
            sendEvent(
                "onNotifyDataA6", mapOf(
                    "uuid" to (uuid ?: ""),
                    "data" to bytes.map { it.toInt() and 0xFF }
                )
            )
        }
    }

    // ── Module definition ──────────────────────────────────────────────────────
    override fun definition() = ModuleDefinition {
        Name("AiLinkSdk")

        Events(
            // BLE lifecycle
            "onStartScan", "onDeviceFound", "onScanTimeOut", "onScanError",
            "onBleStateChange",
            "onConnecting", "onConnected", "onDisconnected",
            // Raw data pass-through
            "onNotifyData", "onNotifyDataA6",
            // Height Body Fat Scale measurement events
            "onRequestUserData",
            "onWeightData",
            "onAdcData",
            "onBodyFatData",
            "onHeightData",
            "onScaleError"
        )

        // ── initSdk ─────────────────────────────────────────────────────────
        AsyncFunction("initSdk") { promise: Promise ->
            try {
                val ctx = applicationContext
                hbfParser.setOnHeightBodyFatListener(this@AiLinkSdkModule)

                if (!AILinkBleManager.getInstance().isInitOk) {
                    AILinkSDK.getInstance().init(ctx)
                    AILinkBleManager.getInstance().init(ctx, object : AILinkBleManager.onInitListener {
                        override fun onInitSuccess() {
                            Log.d(TAG, "BleManager init success")
                            registerBleCallback()
                            promise.resolve(null)
                        }
                        override fun onInitFailure() {
                            Log.e(TAG, "BleManager init failure")
                            promise.reject("INIT_FAILURE", "AILinkBleManager failed to initialise", null)
                        }
                    })
                } else {
                    Log.d(TAG, "BleManager already initialised")
                    registerBleCallback()
                    promise.resolve(null)
                }
            } catch (e: Exception) {
                Log.e(TAG, "initSdk error: ${e.message}")
                promise.reject("INIT_ERROR", e.message ?: "Unknown init error", e)
            }
        }

        // ── startScan ────────────────────────────────────────────────────────
        Function("startScan") { timeout: Int ->
            try {
                if (isScanning) {
                    AILinkBleManager.getInstance().stopScan()
                    isScanning = false
                }
                AILinkBleManager.getInstance().startScan(
                    timeout.toLong(),
                    BleConfig.UUID_SERVER_AILINK
                )
            } catch (e: Exception) {
                Log.e(TAG, "startScan error: ${e.message}")
            }
        }

        // ── stopScan ─────────────────────────────────────────────────────────
        Function("stopScan") {
            try {
                if (isScanning) {
                    AILinkBleManager.getInstance().stopScan()
                    isScanning = false
                }
            } catch (e: Exception) {
                Log.e(TAG, "stopScan error: ${e.message}")
            }
        }

        // ── connectDevice ─────────────────────────────────────────────────────
        Function("connectDevice") { mac: String ->
            try {
                if (isScanning) {
                    AILinkBleManager.getInstance().stopScan()
                    isScanning = false
                }
                Log.d(TAG, "connectDevice: $mac")
                val bean = deviceBeanMap[mac]
                if (bean != null) {
                    AILinkBleManager.getInstance().connectDevice(bean)
                } else {
                    Log.w(TAG, "connectDevice: no cached BleValueBean for $mac, scan first")
                }
            } catch (e: Exception) {
                Log.e(TAG, "connectDevice error: ${e.message}")
            }
        }

        // ── disconnectDevice ──────────────────────────────────────────────────
        Function("disconnectDevice") {
            try {
                Log.d(TAG, "disconnectDevice")
                AILinkBleManager.getInstance().disconnectAll()
            } catch (e: Exception) {
                Log.e(TAG, "disconnectDevice error: ${e.message}")
            }
        }

        // ── A6 utility commands ───────────────────────────────────────────────
        Function("getSupportUnit") {
            try { BleSendCmdUtil.getInstance().supportUnit }
            catch (e: Exception) { Log.e(TAG, "getSupportUnit: ${e.message}") }
        }

        Function("getBleVersion") {
            try { BleSendCmdUtil.getInstance().bleVersion }
            catch (e: Exception) { Log.e(TAG, "getBleVersion: ${e.message}") }
        }

        Function("getBleName") {
            try { BleSendCmdUtil.getInstance().bleName }
            catch (e: Exception) { Log.e(TAG, "getBleName: ${e.message}") }
        }

        Function("setBleName") { name: String ->
            try {
                val nameBytes = BleDataUtils.getInstance().getBleName(name)
                BleSendCmdUtil.getInstance().setBleName(nameBytes)
            } catch (e: Exception) { Log.e(TAG, "setBleName: ${e.message}") }
        }

        // ── Height Body Fat Scale commands ────────────────────────────────────

        /// Set device work mode.
        /// mode: 1=HeightBodyFat, 2=Baby, 3=Weight(+impedance), 4=WeightHeight
        Function("sendWorkMode") { mode: Int ->
            try {
                val workMode = when (mode) {
                    1 -> HeightBodyFatBleUntils.WorkMode.HEIGHT_WEIGHT
                    2 -> HeightBodyFatBleUntils.WorkMode.HEIGHT_WEIGHT  // Baby not universal — fallback
                    3 -> HeightBodyFatBleUntils.WorkMode.WEIGHT
                    4 -> HeightBodyFatBleUntils.WorkMode.HEIGHT
                    else -> {
                        Log.w(TAG, "sendWorkMode: unknown mode $mode")
                        return@Function
                    }
                }
                sendMcuCmd(HeightBodyFatBleUntils.getWorkModeCmd(workMode))
            } catch (e: Exception) { Log.e(TAG, "sendWorkMode: ${e.message}") }
        }

        /// Send user profile to scale (required before body fat calculation).
        /// gender: 1=Male, 2=Female | age: 1–120 | heightCm: 50–269
        Function("sendUserData") { gender: Int, age: Int, heightCm: Int ->
            try {
                sendMcuCmd(HeightBodyFatBleUntils.getUserDataCmd(gender, age, heightCm))
            } catch (e: Exception) { Log.e(TAG, "sendUserData: ${e.message}") }
        }

        /// Set weight unit. weightUnit: 0=kg, 1=jin, 6=lb
        Function("setWeightUnit") { weightUnit: Int ->
            try {
                val unit = when (weightUnit) {
                    0 -> HeightBodyFatBleUntils.WeightUnit.KG
                    1 -> HeightBodyFatBleUntils.WeightUnit.JIN
                    6 -> HeightBodyFatBleUntils.WeightUnit.LB
                    else -> HeightBodyFatBleUntils.WeightUnit.KG
                }
                sendMcuCmd(HeightBodyFatBleUntils.getWeightUnitCmd(unit))
            } catch (e: Exception) { Log.e(TAG, "setWeightUnit: ${e.message}") }
        }

        /// Set height unit. heightUnit: 0=cm, 1=inch/ft
        Function("setHeightUnit") { heightUnit: Int ->
            try {
                val unit = when (heightUnit) {
                    0 -> HeightBodyFatBleUntils.HeightUnit.CM
                    else -> HeightBodyFatBleUntils.HeightUnit.FT
                }
                sendMcuCmd(HeightBodyFatBleUntils.getHeightUnitCmd(unit))
            } catch (e: Exception) { Log.e(TAG, "setHeightUnit: ${e.message}") }
        }

        /// Notify scale that measurement is complete.
        Function("sendWeighingCompleted") {
            try {
                sendMcuCmd(HeightBodyFatBleUntils.getWeighingCompletedCmd())
            } catch (e: Exception) { Log.e(TAG, "sendWeighingCompleted: ${e.message}") }
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun registerBleCallback() {
        AILinkBleManager.getInstance().addOnCallbackBle(this)
    }

    /** Build and send an MCU (A7) command to the currently connected device. */
    private fun sendMcuCmd(cmdBytes: ByteArray) {
        val mac = connectedMac ?: run {
            Log.w(TAG, "sendMcuCmd: no connected device")
            return
        }
        val bleDevice = AILinkBleManager.getInstance().getBleDevice(mac) ?: run {
            Log.w(TAG, "sendMcuCmd: getBleDevice returned null for $mac")
            return
        }
        val mcuBean = SendMcuBean()
        mcuBean.setHex(deviceCid, cmdBytes)
        bleDevice.sendData(mcuBean)
    }

    // ── OnCallbackBle — scan events ───────────────────────────────────────────

    override fun onStartScan() {
        isScanning = true
        Log.d(TAG, "scan started")
        sendEvent("onStartScan", mapOf("isScanning" to true))
    }

    override fun onScanning(data: BleValueBean) {
        val mac = data.mac ?: ""
        val name = data.name ?: ""
        if (mac.isNotEmpty()) deviceBeanMap[mac] = data
        sendEvent("onDeviceFound", mapOf("mac" to mac, "name" to name, "rssi" to data.rssi))
    }

    override fun onScanTimeOut() {
        isScanning = false
        sendEvent("onScanTimeOut", mapOf("isScanning" to false))
    }

    override fun onScanErr(type: Int, time: Long) {
        isScanning = false
        sendEvent("onScanError", mapOf("type" to type, "time" to time))
    }

    // ── OnCallbackBle — BT state ──────────────────────────────────────────────
    override fun bleOpen() { sendEvent("onBleStateChange", mapOf("state" to "on")) }
    override fun bleClose() { sendEvent("onBleStateChange", mapOf("state" to "off")) }

    // ── OnCallbackBle — connection events ─────────────────────────────────────
    override fun onConnecting(mac: String?) {
        Log.d(TAG, "onConnecting: $mac")
        sendEvent("onConnecting", mapOf("mac" to (mac ?: "")))
    }

    override fun onServicesDiscovered(mac: String?) {
        Log.d(TAG, "onServicesDiscovered: $mac")
        connectedMac = mac
        val name = deviceBeanMap[mac ?: ""]?.name ?: ""

        val bleDevice = AILinkBleManager.getInstance().getBleDevice(mac)
        if (bleDevice != null) {
            bleDevice.setOnBleDeviceDataListener(dataListener)
            Log.d(TAG, "data listener wired for $mac")
        } else {
            Log.w(TAG, "getBleDevice returned null for $mac")
        }

        sendEvent("onConnected", mapOf("mac" to (mac ?: ""), "name" to name))
    }

    override fun onDisConnected(mac: String?, code: Int) {
        Log.d(TAG, "onDisConnected: $mac code=$code")
        if (mac == connectedMac) {
            connectedMac = null
            deviceCid = 0
        }
        sendEvent("onDisconnected", mapOf("mac" to (mac ?: ""), "code" to code))
    }

    // ── OnHeightBodyFatListener — parsed measurement callbacks ────────────────

    /** Scale needs user gender/age/height — send sendUserData immediately. */
    override fun onRequestUserData() {
        sendEvent("onRequestUserData", emptyMap<String, Any>())
    }

    /**
     * Weight measurement update.
     * stableType: 0=unstable/realtime, 1=locked final weight
     * weightPoint: decimal places (actual = weightNum / 10^weightPoint)
     * unit: 0=kg, 1=lb, 2=jin
     */
    override fun onWeighingState(stableType: Int, weightNum: Int, weightPoint: Int, unit: Int) {
        sendEvent(
            "onWeightData", mapOf(
                "stable" to stableType,
                "weight" to weightNum,
                "point" to weightPoint,
                "unit" to unit
            )
        )
    }

    /**
     * Impedance (ADC) state change.
     * adcState: 0=measuring, 1=success(app algo), 2=failed, 3=success(MCU algo)
     */
    override fun onAdcData(adcState: Int, aisle: Int, adcValue: Int, algorithmId: Int) {
        sendEvent(
            "onAdcData", mapOf(
                "state" to adcState,
                "aisle" to aisle,
                "adc" to adcValue,
                "algorithmId" to algorithmId
            )
        )
    }

    /** Pre-calculated body composition from MCU firmware. */
    override fun onBodyFatData(model: HeightBodyFatBleBodyModel) {
        sendEvent(
            "onBodyFatData", mapOf(
                "bfr" to model.bfr,
                "sfr" to model.sfr,
                "uvi" to model.uvi,
                "rom" to model.rom,
                "bmr" to model.bmr,
                "bodyAge" to model.bodyAge,
                "bm" to model.bm,
                "vwc" to model.vwc,
                "pp" to model.pp,
                "bmi" to model.bmi,
                "heartRate" to model.heartRate,
                "obesityGrade" to model.obesityGrade
            )
        )
    }

    /** Final height measurement. */
    override fun onHeightData(heightNum: Int, unit: Int, point: Int) {
        sendEvent(
            "onHeightData", mapOf(
                "height" to heightNum,
                "unit" to unit,
                "point" to point
            )
        )
    }

    /** Device error (e.g. 1 = overweight). */
    override fun onErrorCode(code: Int) {
        sendEvent("onScaleError", mapOf("code" to code))
    }
}
