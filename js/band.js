  const MIBAND_SERVICE_UUID = 0xFEE0;
  const BATTERY_INFO_UUID = 0xFF0C;
  const STEPS_UUID = 0xFF06;
  const DEVICE_INFO_UUID = 0xFF01;
  const CONTROL_POINT_UUID = 0xFF05;
  const BLE_CONNECTION_PARAMETERS_UUID = 0xFF09;

  const batteryStatusCodes = new Map([[0, "Unknown"],
                               [1, "Battery Low"],
                               [2, "Battery charging"],
                               [3, "Battery full (charging)"],
                               [4, "Not charging"]]);

class Band {
  constructor(){
    this._server = null;
    this._device = null;
    this._primaryService = null;
    this._characteristics = new Map();
    this.deviceName = null;
  }
  connect(){
      return navigator.bluetooth.requestDevice({filters:[{services:[MIBAND_SERVICE_UUID]}]})
        .then(device => {
          console.log("Found device successfully");
          this._device = device;
          this.deviceName = device.name;
          this._device.addEventListener('gattserverdisconnected',this._onDisconnect);
          return device.gatt.connect()
        })
        .then(server => {
          console.log("Connected successfully")
          this.server = server;
          return server.getPrimaryService(MIBAND_SERVICE_UUID)
        })
        .then(service => {
          this._primaryService = service;
          return Promise.all(this._saveAllCharacteristics(service))
            .then(() => true)
        })
        .catch(exception => {
          console.error(exception);
          return false;
        })
  }
  _saveAllCharacteristics(service){
    return [
      this._saveCharacteristic(service, BATTERY_INFO_UUID),
      this._saveCharacteristic(service, STEPS_UUID),
      this._saveCharacteristic(service, DEVICE_INFO_UUID),
      this._saveCharacteristic(service, CONTROL_POINT_UUID),
      this._saveCharacteristic(service, BLE_CONNECTION_PARAMETERS_UUID)
    ]
  }
  _saveCharacteristic(service, characteristicUUID) {
    return this._primaryService.getCharacteristic(characteristicUUID)
    .then(characteristic => {
      this._characteristics.set(characteristicUUID, characteristic);
    })
    .catch(exception => {
      console.error(exception);
    });
  }
  _readCharacteristicValue(characteristicUUID) {
    let characteristic = this._characteristics.get(characteristicUUID);
    return characteristic.readValue()
      .then(data => data)
      .catch(exception => {
        console.error(exception);
      });
  }
  _writeCharacteristicValue(characteristicUUID, value) {
    let characteristic = this._characteristics.get(characteristicUUID);
    return characteristic.writeValue(value);
  }
  _onDisconnect(event){
    let device = event.target;
    console.log(`MR. ${device.name} has left the building :C`);
  }
  getBluetoothConnectionParameters() {
    return this._readCharacteristicValue(BLE_CONNECTION_PARAMETERS_UUID)
    .then(data => {
      let connIntMin = 0xffff & (0xff & data.getUint8(0) | (0xff & data.getUint8(1)) << 8)
      let connIntMax = 0xffff & (0xff & data.getUint8(2) | (0xff & data.getUint8(3)) << 8)
      let latency = 0xffff & (0xff & data.getUint8(4) | (0xff & data.getUint8(5)) << 8)
      let timeout = 0xffff & (0xff & data.getUint8(6) | (0xff & data.getUint8(7)) << 8)
      let connInt = 0xffff & (0xff & data.getUint8(8) | (0xff & data.getUint8(9)) << 8)
      let advInt = 0xffff & (0xff & data.getUint8(10) | (0xff & data.getUint8(11)) << 8)

      let connectionParams = new Map();
      connectionParams.set('minConnectionInterval', connIntMin * 1.25);
      connectionParams.set('maxConnectionInterval', connIntMax * 1.25);
      connectionParams.set('latency', latency);
      connectionParams.set('supervisionTimeout', timeout * 10);
      connectionParams.set('connectionInterval', connInt * 1.25);
      connectionParams.set('advertisingInterval', advInt * 0.625);

      return connectionParams;
    });
  }
  getDeviceInfo() {
    return this._readCharacteristicValue(DEVICE_INFO_UUID)
    .then(data => {
      let deviceInfo = new Map();
      deviceInfo.set('firmwareVersion', data.getUint8(15) + '.' + data.getUint8(14) + '.' + data.getUint8(13) + '.' + data.getUint8(12));
      deviceInfo.set('profileVersion', data.getUint8(11) + '.' + data.getUint8(10) + '.' + data.getUint8(9) + '.' + data.getUint8(8));
      return deviceInfo;
    });
  }
  getSteps() {
    return this._readCharacteristicValue(STEPS_UUID)
    .then(data => {
      return this.parseSteps(data);
    });
  }
  parseSteps(data) {
    return data.getUint8(0) | (data.getUint8(1) << 8) |
        (data.getUint8(2) << 16) | (data.getUint8(3) << 24);
  }
  scanSteps(callback){
    let characteristic = this._characteristics.get(STEPS_UUID);
    characteristic.addEventListener('characteristicvaluechanged', (event) => {
      let data = event.target.value;
      callback(this.parseSteps(data));
    })
    characteristic.startNotifications();
  }
  stopScanSteps(){
    this._characteristics.get(STEPS_UUID).stopNotifications();
  }
  getDeviceName(){
    return this.deviceName;
  }
  getBatteryInfo() {
    return this._readCharacteristicValue(BATTERY_INFO_UUID)
    .then(data => {
      let lastChargeDate = new Date(2000 + data.getUint8(1),
                                    data.getUint8(2),
                                    data.getUint8(3),
                                    data.getUint8(4),
                                    data.getUint8(5),
                                    data.getUint8(6));
      let batteryInfo = new Map();
      batteryInfo.set('batteryLevel', data.getUint8(0));
      batteryInfo.set('batteryStatusCode', data.getUint8(9));
      batteryInfo.set('batteryStatusText', batteryStatusCodes.get(data.getUint8(9)));
      batteryInfo.set('batteryCharges', 0xffff & (0xff & data.getUint8(7) | (0xff & data.getUint8(8) << 8)));
      batteryInfo.set('batteryLastCharge', lastChargeDate);
      return batteryInfo;
    });
  }
}
