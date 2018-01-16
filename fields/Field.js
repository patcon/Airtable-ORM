class Field {
  constructor(name, value, config = {}) {
    if (typeof name !== 'string') {
      const error = new Error(
        `The 'name' of a Field was not set to a String. ` +
        `Received: ${name}`
      );
      error.name = 'UninitializedFieldError';
      throw error;
    }
    if (config.strict !== true)
      config.strict = false;
    this.name = name;
    this.config = config;
    if (value !== undefined)
      this.value = value;
    this._originalValue = value;
  }

  get _changed() {
    if (Array.isArray(this._originalValue) && Array.isArray(this.value))
      return JSON.stringify([...this._originalValue].sort()) !== JSON.stringify([...this._saveValue].sort());
    return this._originalValue !== this._saveValue && JSON.stringify(this._originalValue) !== JSON.stringify(this.value);
  }

  get _originalValue() {
    return this._originalValue_;
  }

  get _saveValue() {
    if (this.config.strict === true)
      return this.value;

    if (this.value === undefined || this.value === null)
      return null;

    if (this._originalValue === undefined || typeof this.value === typeof this._originalValue)
      return this.value; // doesn't need to be changed
    if (this._originalValue !== undefined) {
      if (this.value === undefined || this.value === null || (typeof this.value === 'number' && isNaN(this.value)))
        return null; // clears the field if they set something to 'undefined', 'null', or 'NaN'
    }
    if (typeof this._originalValue === 'string')
      return `${this.value}`; // converts the value to a string
    if (typeof this._originalValue === 'boolean')
      return !!this.value; // converts the value to a boolean
    if (typeof this._originalValue === 'number')
      return Number(this.value); // converts the value to a number
    if (Array.isArray(this._originalValue))
      return [].concat(this.value); // converts the value to an array
    // if something else needs to be done to change this to the correct value
    // then the class extending Field will need to override get _saveValue()
    return this.value;
  }

  get config() {
    return this._config || {};
  }

  get name() {
    return this._name;
  }

  get record() {
    return this.config.__record__;
  }

  get type() {
    return this._type;
  }

  get value() {
    return this._value === 0 || this._value === false ? this._value : this._value || null;
  }

  set _changed(value) {
    return;
  }

  set _originalValue(value) {
    this._originalValue_ = value;
  }

  set _saveValue(value) {
    return;
  }

  set config(config) {
    if (this._config !== undefined)
      return this._error('config can not be changed!');
    if (typeof config !== 'object' || Array.isArray(config))
      return this._error('config should be key-value Object.', config);
    this._config = config;
  }

  set name(name) {
    if (this._checkName(name))
      this._name = name;
  }

  set record(_) {
    return;
  }

  set type(type) {
    if (this.type !== undefined)
      return this._error('type can not be changed!', type);
    this._type = type;
  }

  set value(value) {
    this._value = value;
  }

  _checkName(name) {
    if (typeof name !== 'string' || name.length < 1)
      return this._error('name must be a string with a minimum length of 1 character.', name);
    return true;
  }

  copy() {
    const copy = new this.constructor(this.name, this.value, this.config);
    copy._originalValue_ = this._originalValue;
    return copy;
  }

  isPrimary() {
    return this.config.primary === true;
  }

  toString(includeName = true) {
    return `${includeName === true ? `${this.name}: ` : ''}${this.value.toString()}`;
  }

  // checks if the object is a Record Object
  _isRecord(object) {
    return typeof object === 'object' && object !== null && object.constructor.name === 'Record';
  }

  // creates a copy of the value and freezes it
  // does not create new instances of Record or Field Objects.
  _deepFreezeValue(value) {
    const cache = {};
    const handleValue = (value) => {
      if (cache[value] === true)
        return value;
      cache[value] = true;
      // Object.isFrozen(undefined/null/NaN) all return true but I left the check here to be safe.
      if (value === undefined || value === null || (typeof value === 'number' && isNaN(value)))
        return value;
      if (Object.isFrozen(value))
        return value;
      if (this._isRecord(value))
        return value;
      if (value instanceof Field)
        return value;
      if (Array.isArray(value))
        return Object.freeze(value.map(value => handleValue(value)));
      if (typeof value === 'object')
        return Object.freeze(Object.entries(value).reduce((obj, [key, value]) => obj[key] = handleValue(value), {}));
      return Object.freeze(JSON.parse(JSON.stringify(value)));
    };
    return handleValue(value);
  }

  _error(message, received, forceThrow = false) {
    const type = this.type === undefined ? 'UninitializedField' : this.constructor.name;
    const base = this.record ? this.record.table ? this.record.table.base : undefined : undefined;
    const table = this.record ? this.record.table ? this.record.table.name : undefined : undefined;
    const record = this.record ? this.record.id : undefined;
    let className;
    if (received !== undefined && received !== null && !(typeof received === 'number' && isNaN(received)))
      className = received.constructor.name;
    let rPrint;
    if (this._isRecord(received))
      rPrint = received.stringify(null, 2);
    else if (received instanceof Field)
      rPrint = received.toString(false);
    else
      rPrint = JSON.stringify(received, null, 2);
    const error = new Error(
      `${message}` +
      '\n=====FIELD INFO=====' +
      `\nBase: ${base}` +
      `\nTable: ${table}` +
      `\nRecord: ${record}` +
      `\nField: ${this.name}` +
      `\nStrict: ${this.config.strict === true ? 'true' : 'false'}` +
      `\nReceived: ${rPrint}` +
      `\nType: ${Array.isArray(received) ? 'array' : typeof received}` +
      (className !== undefined ? `\nClass: ${className}` : '') +
      '\n=====FIELD INFO====='
    );
    error.name = `${type}Error`;
    if (this.type !== undefined && (forceThrow === true || this.config.__ignoreFieldErrors__ !== true))
      throw error;
    console.error(`${error.stack}`);
    if (this.type === undefined) {
      console.error(
        'Fields which fail to initialize will cause a lot of problems later on.\n' +
        `Because the field failed to initialize, there is a good possibility that data which wasn't allowed with your field config came in from Airtable.\n` +
        'This can happen if you have a NumberField set to strict with a precision of 2 and the value 12.888 is saved on Airtable.\nThe Airtable website ' +
        'will make that look like 12.89 and you can only interract with it as 12.89 on the website, however their REST API will send 12.888.\n' +
        'To prevent failures throughout the API, exiting with status code 2.'
      );
      process.exit(2);
    }
  }

  _warn(message, received) {
    const type = this.type === undefined ? 'UninitializedField' : this.constructor.name;
    const base = this.record ? this.record.table ? this.record.table.base : undefined : undefined;
    const table = this.record ? this.record.table ? this.record.table.name : undefined : undefined;
    const record = this.record ? this.record.id : undefined;
    let className;
    if (received !== undefined && received !== null && !(typeof received === 'number' && isNaN(received)))
      className = received.constructor.name;
    let rPrint;
    if (this._isRecord(received))
      rPrint = received.stringify(null, 2);
    else if (received instanceof Field)
      rPrint = received.toString(false);
    else
      rPrint = JSON.stringify(received, null, 2);
    const warning = (
      `${type}Warning: ${message}` +
      '\n=====FIELD INFO=====' +
      `\nBase: ${base}` +
      `\nTable: ${table}` +
      `\nRecord: ${record}` +
      `\nField: ${this.name}` +
      `\nStrict: ${this.config.strict === true ? 'true' : 'false'}` +
      `\nReceived: ${rPrint}` +
      `\nType: ${Array.isArray(received) ? 'array' : typeof received}` +
      (className !== undefined ? `\nClass: ${className}` : '') +
      '\n=====FIELD INFO====='
    );
    console.warn(warning);
  }
}

module.exports = Field;
