import ExpoModulesCore
import AILinkBleSDK

// MARK: - Module

public class AiLinkSdkModule: Module {

    private var isScanning = false
    /// mac → ELPeripheralModel, populated during scan for connectDevice look-up.
    private var peripheralMap: [String: ELPeripheralModel] = [:]
    private var scanTimer: Timer?

    private lazy var bleDelegate = BleSdkDelegate(module: self)
    private lazy var hbfDelegate = HeightBodyFatScaleDelegate(module: self)

    fileprivate var bleManager: ELHeightBodyFatScaleBleManager {
        return ELHeightBodyFatScaleBleManager.share()
    }

    public func definition() -> ModuleDefinition {
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

        // ── initSdk ──────────────────────────────────────────────────────────
        AsyncFunction("initSdk") { (promise: Promise) in
            DispatchQueue.main.async {
                self.bleManager.delegate = self.bleDelegate
                self.bleManager.heightBodyFatScaleDelegate = self.hbfDelegate
                promise.resolve(nil)
            }
        }

        // ── startScan ────────────────────────────────────────────────────────
        Function("startScan") { (timeout: Int) in
            DispatchQueue.main.async {
                self.peripheralMap.removeAll()
                self.bleManager.startScan()
                self.isScanning = true
                self.sendEvent("onStartScan", ["isScanning": true])

                if timeout > 0 {
                    self.scanTimer?.invalidate()
                    self.scanTimer = Timer.scheduledTimer(
                        withTimeInterval: TimeInterval(timeout) / 1000.0,
                        repeats: false
                    ) { [weak self] _ in
                        guard let self, self.isScanning else { return }
                        self.bleManager.stopScan()
                        self.isScanning = false
                        self.sendEvent("onScanTimeOut", ["isScanning": false])
                    }
                }
            }
        }

        // ── stopScan ─────────────────────────────────────────────────────────
        Function("stopScan") {
            DispatchQueue.main.async {
                self.scanTimer?.invalidate()
                self.scanTimer = nil
                self.bleManager.stopScan()
                self.isScanning = false
            }
        }

        // ── connectDevice ────────────────────────────────────────────────────
        Function("connectDevice") { (mac: String) in
            DispatchQueue.main.async {
                if self.isScanning {
                    self.scanTimer?.invalidate()
                    self.scanTimer = nil
                    self.bleManager.stopScan()
                    self.isScanning = false
                }
                guard let peripheral = self.peripheralMap[mac] else {
                    NSLog("[AiLinkSdk] connectDevice: no cached peripheral for %@, scan first", mac)
                    return
                }
                self.bleManager.connectPeripheral(peripheral)
            }
        }

        // ── disconnectDevice ─────────────────────────────────────────────────
        Function("disconnectDevice") {
            DispatchQueue.main.async {
                self.bleManager.disconnectPeripheral()
            }
        }

        // ── A6 utility commands ───────────────────────────────────────────────
        Function("getSupportUnit") {
            self.bleManager.getBluetoothInfo(with: .cmdTypeReadDeviceSupportUnit)
        }

        Function("getBleVersion") {
            self.bleManager.getBluetoothInfo(with: .cmdTypeGetBMVersion)
        }

        Function("getBleName") {
            self.bleManager.getBluetoothInfo(with: .cmdTypeGetName)
        }

        Function("setBleName") { (name: String) in
            self.bleManager.setBluetoothName(name)
        }

        // ── Height Body Fat Scale commands ───────────────────────────────────

        /// Set device work mode.
        /// mode: 1=HeightBodyFat, 2=Baby, 3=Weight(+impedance), 4=WeightHeight
        Function("sendWorkMode") { (mode: Int) in
            DispatchQueue.main.async {
                guard let workMode = HeightBodyFatScale_WorkModeType(rawValue: mode) else {
                    NSLog("[AiLinkSdk] sendWorkMode: invalid mode %d", mode)
                    return
                }
                self.bleManager.sendDeviceWorkMode(workMode)
            }
        }

        /// Send user profile to scale (required before body fat calculation).
        /// gender: 1=Male, 2=Female | age: 1–120 | heightCm: 50–269
        Function("sendUserData") { (gender: Int, age: Int, heightCm: Int) in
            DispatchQueue.main.async {
                self.bleManager.sendUserData(withGender: gender, age: age, heightInCm: heightCm)
            }
        }

        /// Set weight and height units together.
        /// weightUnit: 0=kg, 1=jin, 2=lb_oz, 6=lb | heightUnit: 0=cm, 1=inch, 2=ft_in
        Function("setUnit") { (weightUnit: Int, heightUnit: Int) in
            DispatchQueue.main.async {
                let wu = ELDeviceWeightUnit(rawValue: weightUnit) ?? ELDeviceWeightUnit.KG
                let hu = ELDeviceHeightUnit(rawValue: heightUnit) ?? ELDeviceHeightUnit.CM
                self.bleManager.sendUnit(with: hu, weightUnit: wu)
            }
        }

        /// Notify scale that measurement is complete.
        Function("sendWeighingCompleted") {
            DispatchQueue.main.async {
                self.bleManager.sendWeighingCompleted()
            }
        }
    }

    fileprivate func storePeripheral(_ peripheral: ELPeripheralModel) {
        let mac = peripheral.macAddress
        if !mac.isEmpty {
            peripheralMap[mac] = peripheral
        }
    }
}

// MARK: - Height Body Fat Scale Delegate

private class HeightBodyFatScaleDelegate: NSObject, ELHeightBodyFatScaleBleDelegate {
    weak var module: AiLinkSdkModule?

    init(module: AiLinkSdkModule) {
        self.module = module
    }

    /// Scale requests user gender/age/height — app must call sendUserData immediately.
    func heightBodyFatScaleManagerRequestUserData() {
        module?.sendEvent("onRequestUserData", [:])
    }

    /// Live + final weight readings.
    /// stable: 0=unstable/realtime, 1=locked final weight
    func heightBodyFatScaleManagerReportWeighingState(
        _ stable: HeightBodyFatScale_WeightStableType,
        weightNumber weight: Int,
        weightPoint point: Int,
        unit: ELDeviceWeightUnit
    ) {
        // HeightBodyFatScale_WeightStableType_RealTime=0x01, _Stable=0x02
        let stableNorm = (stable.rawValue == 0x02) ? 1 : 0
        module?.sendEvent("onWeightData", [
            "stable": stableNorm,
            "weight": weight,
            "point": point,
            "unit": unit.rawValue
        ])
    }

    /// Impedance (ADC) measurement state.
    /// state: 0=measuring, 1=success(app algo), 2=failed, 3=success(MCU algo), 4=over
    func heightBodyFatScaleManagerReportAdcData(
        withImpedanceState state: HeightBodyFatScale_AdcStateType,
        aisle: HeightBodyFatScale_AdcAisleType,
        adc: Int,
        algorithmId: Int
    ) {
        // _Measuring=0x01, _Failed=0x02, _Success_UseAppAlgorithm=0x03, _Success_UseMCUAlgorithm=0x04, _Over=0x05
        let stateNorm: Int
        switch state.rawValue {
        case 0x01: stateNorm = 0  // measuring
        case 0x03: stateNorm = 1  // success, use app algorithm
        case 0x02: stateNorm = 2  // failed
        case 0x04: stateNorm = 3  // success, MCU algorithm ran
        case 0x05: stateNorm = 4  // over
        default:   stateNorm = -1
        }
        module?.sendEvent("onAdcData", [
            "state": stateNorm,
            "aisle": aisle.rawValue,
            "adc": adc,
            "algorithmId": algorithmId
        ])
    }

    /// Pre-calculated body composition from MCU firmware (all values need /10 except bmr, bodyAge, uvi, heartRate, obesityGrade).
    func heightBodyFatScaleManagerReportBodyFatData(
        withDataModel model: ELHeightBodyFatScaleBleWeightBodyModel
    ) {
        module?.sendEvent("onBodyFatData", [
            "bfr":          model.bfr,
            "sfr":          model.sfr,
            "uvi":          model.uvi,
            "rom":          model.rom,
            "bmr":          model.bmr,
            "bodyAge":      model.bodyAge,
            "bm":           model.bm,
            "vwc":          model.vwc,
            "pp":           model.pp,
            "bmi":          model.bmi,
            "heartRate":    model.heartRate,
            "obesityGrade": model.obesityGrade
        ])
    }

    /// Final height measurement.
    func heightBodyFatScaleManagerReportHeightData(
        withHeight height: Int,
        unit: ELDeviceHeightUnit,
        point: Int
    ) {
        module?.sendEvent("onHeightData", [
            "height": height,
            "unit":   unit.rawValue,
            "point":  point
        ])
    }
}

// MARK: - BLE Delegate (NSObject required for ObjC protocol)

private class BleSdkDelegate: NSObject, ELBluetoothManagerDelegate {
    weak var module: AiLinkSdkModule?

    init(module: AiLinkSdkModule) {
        self.module = module
    }

    // ── BT + connection state ────────────────────────────────────────────────
    func bluetoothManagerUpdateBleState(_ state: ELBluetoothState) {
        guard let module else { return }
        switch state {
        case .available:
            module.sendEvent("onBleStateChange", ["state": "on"])
        case .unavailable, .unauthorized:
            module.sendEvent("onBleStateChange", ["state": "off"])
        case .willConnect:
            let mac = module.bleManager.peripheralModel.macAddress
            module.sendEvent("onConnecting", ["mac": mac])
        case .didDiscoverCharacteristics:
            let peripheral = module.bleManager.peripheralModel
            module.sendEvent("onConnected", ["mac": peripheral.macAddress, "name": peripheral.deviceName])
        case .didDisconnect:
            let mac = module.bleManager.peripheralModel.macAddress
            module.sendEvent("onDisconnected", ["mac": mac, "code": 0])
        case .connectFail:
            let mac = module.bleManager.peripheralModel.macAddress
            module.sendEvent("onDisconnected", ["mac": mac, "code": -1])
        default:
            break
        }
    }

    // ── Scan results ─────────────────────────────────────────────────────────
    func bluetoothManagerScanedPeripherals(_ peripherals: [ELPeripheralModel]) {
        guard let module else { return }
        for peripheral in peripherals {
            module.storePeripheral(peripheral)
            module.sendEvent("onDeviceFound", [
                "mac":  peripheral.macAddress,
                "name": peripheral.deviceName,
                "rssi": peripheral.rssi
            ])
        }
    }

    // ── A7 raw data ──────────────────────────────────────────────────────────
    func bluetoothManagerReceive(_ data: Data, deviceType type: ELSupportDeviceType) {
        module?.sendEvent("onNotifyData", [
            "uuid": "",
            "data": data.map { Int($0) },
            "type": Int(type.rawValue)
        ])
    }

    // ── A6 responses ─────────────────────────────────────────────────────────
    func bluetoothManagerReceiveBMVersion(_ bmVersion: String) {
        module?.sendEvent("onNotifyDataA6", [
            "uuid": "",
            "data": Array(bmVersion.utf8).map { Int($0) }
        ])
    }

    func bluetoothManagerReceiceName(_ name: String?) {
        guard let name else { return }
        module?.sendEvent("onNotifyDataA6", [
            "uuid": "",
            "data": Array(name.utf8).map { Int($0) }
        ])
    }

    func bluetoothManagerReceiveMACAddress(_ macAddress: String) {
        module?.sendEvent("onNotifyDataA6", [
            "uuid": "",
            "data": Array(macAddress.utf8).map { Int($0) }
        ])
    }

    func bluetoothManagerBackDeviceSupportUnit(
        withWeight weightArray: [NSNumber]?,
        height heightArray: [NSNumber]?,
        temperature temperatureArray: [NSNumber]?,
        bloodPressure bloodPressureArray: [NSNumber]?,
        pressure pressureArray: [NSNumber]?
    ) {
        let all = [weightArray, heightArray, temperatureArray, bloodPressureArray, pressureArray]
            .compactMap { $0 }
            .flatMap { $0 }
            .map { $0.intValue }
        module?.sendEvent("onNotifyDataA6", ["uuid": "", "data": all])
    }
}
