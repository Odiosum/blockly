/* Run with node tests/esp32py_core_test.js path/to/blockly_compressed.js path/to/@xmldom/xmldom. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[2] || 'blockly_compressed.js', 'utf8');

function compiledFunction(start, end) {
  const first = source.indexOf(start);
  assert.ok(first >= 0, 'missing compiled function: ' + start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(last > first, 'missing compiled boundary: ' + end);
  return source.slice(first + start.length, last);
}

const goog = {
  asserts: {assert: value => assert.ok(value)},
  ui: {Component: {Error: {}}},
  object: {set: (object, key, value) => { object[key] = value; }},
  array: {
    remove: (array, value) => array.splice(array.indexOf(value), 1),
    insertAt: (array, value, index) => array.splice(index, 0, value)
  }
};
const addChildAt = vm.runInNewContext('(' + compiledFunction(
    'goog.ui.Component.prototype.addChildAt=',
    ';goog.ui.Component.prototype.getContentElement=') + ')', {goog});

for (const [moved, index, expected] of [
  ['A', 2, ['B', 'C', 'A']],
  ['C', 0, ['C', 'A', 'B']],
  ['B', 1, ['A', 'B', 'C']]
]) {
  const dom = {
    childNodes: ['A', 'B', 'C'],
    contains(value) { return this.childNodes.includes(value); },
    removeChild(value) { this.childNodes.splice(this.childNodes.indexOf(value), 1); },
    insertBefore(value, before) {
      if (this.contains(value)) this.removeChild(value);
      this.childNodes.splice(before === null ? this.childNodes.length : this.childNodes.indexOf(before), 0, value);
    }
  };
  const parent = {
    inDocument_: true, childIndex_: {}, children_: [],
    getChildCount() { return this.children_.length; },
    getContentElement() { return dom; }
  };
  parent.children_ = ['A', 'B', 'C'].map(id => ({
    inDocument_: true, getId: () => id, getElement: () => id,
    getParent: () => parent, setParent: value => assert.strictEqual(value, parent)
  }));
  addChildAt.call(parent, parent.children_.find(child => child.getId() === moved), index, false);
  assert.deepStrictEqual(parent.children_.map(child => child.getId()), expected);
  assert.deepStrictEqual(dom.childNodes, expected, 'DOM and component order must match deployed Lab behavior');
}

const hidePort = vm.runInNewContext('(function' + compiledFunction(
    'function hidePortIfOnlyInbuilt', ';Blockly.Blocks.robSensorDefinitionsDataAvailable=') + ')', {
  Blockly: {FieldHidden: function() {}}
});
function portBlock(device, menu) {
  const field = {name: 'ACTORPORT', menuGenerator_: menu, getValue: () => 'A'};
  const input = {
    fieldRow: [field],
    removeField(name) { this.fieldRow = this.fieldRow.filter(item => item.name !== name); },
    appendField(value, name) { value.name = name; this.fieldRow.push(value); }
  };
  return {workspace: {device}, inputList: [input]};
}
assert.doesNotThrow(() => hidePort(portBlock('esp32py', undefined)));
assert.throws(() => hidePort(portBlock('ev3', undefined)), error => error.name === 'TypeError');
for (const device of ['esp32py', 'ev3', 'rcj', 'microbit', 'arduino']) {
  const single = portBlock(device, [['A', 'A']]);
  hidePort(single);
  assert.strictEqual(single.hide.value, 'A');
  const multiple = portBlock(device, [['A', 'A'], ['B', 'B']]);
  hidePort(multiple);
  assert.strictEqual(multiple.hide, undefined);
}

console.log('Blockly component reordering and ESP32-only port guard compatibility passed.');

if (!process.argv[3]) {
  console.error('Missing path to @xmldom/xmldom; the ESP32Py block behavior tests need it.');
  process.exit(1);
}
{
  const xmldom = require(process.argv[3]);
  const context = {
    DOMParser: xmldom.DOMParser,
    XMLSerializer: xmldom.XMLSerializer,
    document: new xmldom.DOMImplementation().createDocument(),
    console, setTimeout, clearTimeout
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const Blockly = context.Blockly;
  Blockly.Block.prototype.getErrorText = function() { return ''; };
  Blockly.Block.prototype.setBlocking = function() {};
  Blockly.Block.prototype.render = function() {};
  function workspace(device) {
    const result = new Blockly.Workspace();
    result.device = device;
    return result;
  }
  function newBlock(target, type) {
    Blockly.Events.disable();
    const block = target.newBlock(type);
    Blockly.Events.enable();
    return block;
  }
  function optionValues(block) {
    return Array.from(block.getField('SENSORPORT').menuGenerator_, option => option[1]);
  }
  function changeField(target, block, name, value) {
    const field = block.getField(name);
    const oldValue = field.getValue();
    Blockly.Events.disable();
    field.setValue(value);
    Blockly.Events.enable();
    target.fireChangeListener(new Blockly.Events.Change(block, 'field', name, oldValue, value));
  }
  async function runEsp32pyBlocks() {
    const defaults = workspace('esp32py');
    const profiles = [
      ['robConf_esp32py_drv8833', {NAME: 'DRV8833', driverKind: '', leftIn1: '', leftIn2: '', rightIn1: '', rightIn2: '', leftInverted: 'false', rightInverted: 'false', pwmFrequency: '', leftCalibration: '', rightCalibration: '', stopMode: ''}],
      ['robConf_esp32py_board', {NAME: 'ESP32PY', boardKind: 'ESP32_WROOM_32_30PIN_V1'}],
      ['robConf_esp32py_touch', {NAME: 'TOUCH', pin: '', activeLevel: 'HIGH', biasMode: 'EXTERNAL_PULLDOWN', rcjPort: ''}],
      ['robConf_esp32py_light', {NAME: 'LIGHT', pin: '', rawDark: '', rawLight: '', rcjPort: ''}],
      ['robConf_esp32py_ultrasonic', {NAME: 'ULTRASONIC', profileMode: 'SIMULATION', triggerPin: '', echoPin: '', maxDistanceCm: '250', timeoutUs: '20000', rcjPort: '', deviceModel: 'TRIGGER_ECHO_3V3', echoVoltage: '3V3', power: '5V', supplyMode: 'EXTERNAL_REGULATED_COMMON_GND'}],
      ['robConf_esp32py_colour', {NAME: 'COLOUR', profileMode: 'SIMULATION', rcjPort: '', deviceModel: 'TCS34725', i2cProfile: 'I2C', address: '0x29', interface: 'I2C', power: '3V3', whiteR: '', whiteG: '', whiteB: ''}],
      ['robConf_esp32py_inductive', {NAME: 'INDUCTIVE', profileMode: 'SIMULATION', rcjPort: '', deviceModel: 'OPEN_COLLECTOR_ACTIVE_LOW', signalPin: 'GPIO34', activeLevel: 'LOW', biasMode: 'EXTERNAL_PULLUP', pullupOhms: '10000', pullupVoltage: '3V3', power: '5V', supplyMode: 'EXTERNAL_REGULATED_COMMON_GND'}],
      ['robConf_esp32py_i2c', {NAME: 'I2C', sdaPin: 'GPIO21', sclPin: 'GPIO22', frequency: '400000', voltage: '3V3'}],
      ['robConf_esp32py_gyro', {NAME: '_K', deviceModel: 'MPU6050', i2cProfile: 'I2C', address: '0x68', interface: 'I2C', axis: 'Z', angleMode: 'RELATIVE_INTEGRATED', power: '3V3'}],
      ['robConf_esp32py_touchkey', {NAME: 'TOUCHKEY', leftPin: 'GPIO4', rightPin: 'GPIO13', thresholdPercent: '70'}],
      ['robConf_esp32py_display', {NAME: 'DISPLAY', deviceModel: 'SSD1306_128X64', i2cProfile: 'I2C', address: '0x3C', interface: 'I2C', power: '3V3'}],
      ['robConf_esp32py_buzzer', {NAME: 'BUZZER', deviceModel: 'PWM_BUZZER', pin: 'GPIO16', power: '5V', supplyMode: 'EXTERNAL_REGULATED_COMMON_GND'}],
      ['robConf_esp32py_rgb', {NAME: 'RGB', deviceModel: 'WS2812_GRB', pin: 'GPIO23', power: '5V', supplyMode: 'EXTERNAL_REGULATED_COMMON_GND', seriesResistorOhms: '330'}],
      ['robConf_esp32py_grabber', {NAME: 'Grabber', deviceModel: 'CONTINUOUS_SERVO', pin: 'GPIO17', frequency: '50', minPulseUs: '700', maxPulseUs: '2300', neutralPulseUs: '1500', power: '5V', supplyMode: 'EXTERNAL_REGULATED_COMMON_GND', bulkCapacitorUf: '1000'}]
    ];
    for (const [type, fields] of profiles) {
      const block = newBlock(defaults, type);
      for (const [name, value] of Object.entries(fields)) assert.strictEqual(block.getFieldValue(name), value, type + ' preserves ' + name);
    }
    const configuration = workspace('esp32py');
    const program = workspace('esp32py');
    Blockly.Workspace.getByContainer = () => configuration;
    const touch = newBlock(configuration, 'robConf_esp32py_touch');
    const touchSample = newBlock(program, 'robSensors_touch_getSample');
    assert.deepStrictEqual(optionValues(touchSample), ['TOUCH']);
    const touchXml = Blockly.Xml.blockToDom(touchSample, []);
    const importedPort = Array.from(touchXml.getElementsByTagName('field')).find(field => field.getAttribute('name') === 'SENSORPORT');
    importedPort.textContent = 'missing';
    const importedTouch = Blockly.Xml.domToBlock(touchXml, program);
    assert.strictEqual(importedTouch.getFieldValue('SENSORPORT'), 'missing');
    assert.deepStrictEqual(optionValues(importedTouch), ['missing', 'TOUCH']);
    importedTouch.setFieldValue('TOUCH', 'SENSORPORT');
    assert.deepStrictEqual(optionValues(importedTouch), ['TOUCH']);
    changeField(configuration, touch, 'NAME', 'front');
    assert.deepStrictEqual(optionValues(touchSample), ['TOUCH', 'front']);
    assert.deepStrictEqual(optionValues(newBlock(program, 'robSensors_touch_getSample')), ['front']);
    Blockly.Events.disable(); touch.dispose(false); Blockly.Events.enable();
    configuration.fireChangeListener({type: Blockly.Events.DELETE});
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepStrictEqual(optionValues(newBlock(program, 'robSensors_touch_getSample')), [String(Blockly.Msg.CONFIGURATION_NO_PORT).toUpperCase()]);
    const colour = newBlock(configuration, 'robConf_esp32py_colour'); changeField(configuration, colour, 'NAME', 'C1');
    const light = newBlock(configuration, 'robConf_esp32py_light'); changeField(configuration, light, 'NAME', 'L1');
    const colourSample = newBlock(program, 'robSensors_colour_getSample');
    assert.deepStrictEqual(optionValues(colourSample), ['C1']);
    changeField(program, colourSample, 'MODE', 'LIGHT');
    assert.deepStrictEqual(optionValues(colourSample), ['C1', 'L1']);
    program.undo(false); assert.strictEqual(colourSample.getFieldValue('MODE'), 'COLOUR'); assert.deepStrictEqual(optionValues(colourSample), ['C1']);
    program.undo(true); assert.strictEqual(colourSample.getFieldValue('MODE'), 'LIGHT'); assert.deepStrictEqual(optionValues(colourSample), ['C1', 'L1']);
    const ultrasonic = newBlock(configuration, 'robConf_esp32py_ultrasonic'); changeField(configuration, ultrasonic, 'NAME', 'U1');
    assert.deepStrictEqual(optionValues(newBlock(program, 'robSensors_ultrasonic_getSample')), ['U1']);
    const inductive = newBlock(configuration, 'robConf_esp32py_inductive'); changeField(configuration, inductive, 'NAME', 'I1');
    assert.deepStrictEqual(optionValues(newBlock(program, 'robSensors_inductive_getSample')), ['I1']);
    assert.strictEqual(newBlock(program, 'robSensors_gyro_getSample').hide.value, '_K');
    assert.deepStrictEqual(optionValues(newBlock(program, 'robSensors_touchkey_getSample')), ['LEFT', 'RIGHT']);
    for (const type of ['robActions_motor_on', 'robActions_motor_on_for', 'robActions_motor_stop']) {
      assert.strictEqual(newBlock(program, type).getFieldValue('MOTORPORT'), 'Grabber');
      const xml = context.document.createElement('block'); xml.setAttribute('type', type);
      const field = context.document.createElement('field'); field.setAttribute('name', 'MOTORPORT'); field.appendChild(context.document.createTextNode('I')); xml.appendChild(field);
      assert.strictEqual(Blockly.Xml.domToBlock(xml, program).getFieldValue('MOTORPORT'), 'I', type + ' preserves an unsupported imported port');
    }
    const rcj = workspace('rcj');
    assert.notStrictEqual(newBlock(rcj, 'robActions_motor_on').getFieldValue('MOTORPORT'), 'Grabber');
    for (const value of ['rcj-aggregate-v1', '', 'not-a-known-mode']) {
      const math = newBlock(program, 'math_on_list');
      const mutation = context.document.createElement('mutation'); mutation.setAttribute('op', 'SUM'); mutation.setAttribute('mode', value);
      math.domToMutation(mutation);
      changeField(program, math, 'OP', 'AVERAGE');
      assert.strictEqual(math.mutationToDom().getAttribute('mode'), value);
      const copy = Blockly.Xml.domToBlock(Blockly.Xml.blockToDom(math, []), program);
      assert.strictEqual(copy.getFieldValue('OP'), 'AVERAGE');
      assert.strictEqual(copy.mutationToDom().getAttribute('mode'), value);
      mutation.removeAttribute('mode');
      math.domToMutation(mutation);
      assert.strictEqual(math.mutationToDom().hasAttribute('mode'), false);
    }
    assert.strictEqual(newBlock(program, 'math_on_list').mutationToDom().hasAttribute('mode'), false);
    for (const other of [rcj, workspace('ev3')]) {
      const otherMath = newBlock(other, 'math_on_list');
      const otherMutation = context.document.createElement('mutation'); otherMutation.setAttribute('op', 'SUM'); otherMutation.setAttribute('mode', 'rcj-aggregate-v1');
      otherMath.domToMutation(otherMutation); assert.strictEqual(otherMath.mutationToDom().hasAttribute('mode'), false);
    }
  }
  runEsp32pyBlocks().then(() => console.log('ESP32Py profile and block behavior passed.'), (error) => {
    console.error(error);
    process.exit(1);
  });
}
