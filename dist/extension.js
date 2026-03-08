var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "node_modules/ws/lib/constants.js"(exports2, module2) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob)
      BINARY_TYPES.push("blob");
    module2.exports = {
      BINARY_TYPES,
      CLOSE_TIMEOUT: 3e4,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: Symbol("kIsForOnEventAttribute"),
      kListener: Symbol("kListener"),
      kStatusCode: Symbol("status-code"),
      kWebSocket: Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "node_modules/ws/lib/buffer-util.js"(exports2, module2) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0)
        return EMPTY_BUFFER;
      if (list.length === 1)
        return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data))
        return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module2.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = require("bufferutil");
        module2.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48)
            _mask(source, mask, output, offset, length);
          else
            bufferUtil.mask(source, mask, output, offset, length);
        };
        module2.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32)
            _unmask(buffer, mask);
          else
            bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "node_modules/ws/lib/limiter.js"(exports2, module2) {
    "use strict";
    var kDone = Symbol("kDone");
    var kRun = Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency)
          return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module2.exports = Limiter;
  }
});

// node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "node_modules/ws/lib/permessage-deflate.js"(exports2, module2) {
    "use strict";
    var zlib = require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = Symbol("permessage-deflate");
    var kTotalLength = Symbol("total-length");
    var kCallback = Symbol("callback");
    var kBuffers = Symbol("buffers");
    var kError = Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       * @param {Boolean} [isServer=false] Create the instance in either server or
       *     client mode
       * @param {Number} [maxPayload=0] The maximum allowed message length
       */
      constructor(options, isServer, maxPayload) {
        this._maxPayload = maxPayload | 0;
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._isServer = !!isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && !params.client_max_window_bits) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin)
          this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err = this._inflate[kError];
          if (err) {
            this._inflate.close();
            this._inflate = null;
            callback(err);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module2.exports = PerMessageDeflate;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err[kStatusCode] = 1007;
      this[kCallback](err);
    }
  }
});

// node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "node_modules/ws/lib/validation.js"(exports2, module2) {
    "use strict";
    var { isUtf8 } = require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module2.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module2.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = require("utf-8-validate");
        module2.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "node_modules/ws/lib/receiver.js"(exports2, module2) {
    "use strict";
    var { Writable } = require("stream");
    var PerMessageDeflate = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO)
          return cb();
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length)
          return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored)
          cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented)
          this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126)
          this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127)
          this._state = GET_PAYLOAD_LENGTH_64;
        else
          this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked)
          this._state = GET_MASK;
        else
          this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err, buf) => {
          if (err)
            return cb(err);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO)
            this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err, this.createError);
        err.code = errorCode;
        err[kStatusCode] = statusCode;
        return err;
      }
    };
    module2.exports = Receiver;
  }
});

// node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "node_modules/ws/lib/sender.js"(exports2, module2) {
    "use strict";
    var { Duplex } = require("stream");
    var { randomFillSync } = require("crypto");
    var PerMessageDeflate = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1)
          target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask)
          return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking)
          return [target, data];
        if (merge) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else {
            buf.set(data, 2);
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin)
          this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options, cb);
          }
        }).catch((err) => {
          process.nextTick(onError, this, err, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module2.exports = Sender;
    function callCallbacks(sender, err, cb) {
      if (typeof cb === "function")
        cb(err);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function")
          callback(err);
      }
    }
    function onError(sender, err, cb) {
      callCallbacks(sender, err, cb);
      sender.onerror(err);
    }
  }
});

// node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "node_modules/ws/lib/event-target.js"(exports2, module2) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = Symbol("kCode");
    var kData = Symbol("kData");
    var kError = Symbol("kError");
    var kMessage = Symbol("kMessage");
    var kReason = Symbol("kReason");
    var kTarget = Symbol("kTarget");
    var kType = Symbol("kType");
    var kWasClean = Symbol("kWasClean");
    var Event = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event.prototype, "target", { enumerable: true });
    Object.defineProperty(Event.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options = {}) {
        super(type);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options = {}) {
        super(type);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options = {}) {
        super(type);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options = {}) {
        for (const listener of this.listeners(type)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module2.exports = {
      CloseEvent,
      ErrorEvent,
      Event,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "node_modules/ws/lib/extension.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function push(dest, name, elem) {
      if (dest[name] === void 0)
        dest[name] = [elem];
      else
        dest[name].push(elem);
    }
    function parse(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1)
              start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1)
              end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1)
              end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1)
              start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1)
              end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1)
              end = i;
            push(params, header.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1)
              start = i;
            else if (!mustUnescape)
              mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1)
                start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1)
              start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1)
              end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1)
              end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1)
        end = i;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token, params);
      } else {
        if (paramName === void 0) {
          push(params, token, true);
        } else if (mustUnescape) {
          push(params, paramName, token.replace(/\\/g, ""));
        } else {
          push(params, paramName, token);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension) => {
        let configurations = extensions[extension];
        if (!Array.isArray(configurations))
          configurations = [configurations];
        return configurations.map((params) => {
          return [extension].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values))
                values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module2.exports = { format, parse };
  }
});

// node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "node_modules/ws/lib/websocket.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events");
    var https = require("https");
    var http2 = require("http");
    var net = require("net");
    var tls = require("tls");
    var { randomBytes, createHash } = require("crypto");
    var { Duplex, Readable } = require("stream");
    var { URL: URL2 } = require("url");
    var PerMessageDeflate = require_permessage_deflate();
    var Receiver = require_receiver();
    var Sender = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      CLOSE_TIMEOUT,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse } = require_extension();
    var { toBuffer } = require_buffer_util();
    var kAborted = Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket = class _WebSocket extends EventEmitter {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            protocols = [];
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              protocols = [];
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._closeTimeout = options.closeTimeout;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type))
          return;
        this._binaryType = type;
        if (this._receiver)
          this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket)
          return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head, options) {
        const receiver = new Receiver({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender(socket, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout)
          socket.setTimeout(0);
        if (socket.setNoDelay)
          socket.setNoDelay();
        if (head.length > 0)
          socket.unshift(head);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate.extensionName]) {
          this._extensions[PerMessageDeflate.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED)
          return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._readyState = _WebSocket.CLOSING;
        this._sender.close(code, data, !this._isServer, (err) => {
          if (err)
            return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number")
          data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0)
          mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number")
          data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0)
          mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain)
          this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number")
          data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED)
          return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute])
              return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function")
            return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket.prototype.addEventListener = addEventListener;
    WebSocket.prototype.removeEventListener = removeEventListener;
    module2.exports = WebSocket;
    function initAsClient(websocket, address, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        closeTimeout: CLOSE_TIMEOUT,
        protocolVersion: protocolVersions[1],
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      websocket._closeTimeout = opts.closeTimeout;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL2) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL2(address);
        } catch (e) {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err;
        } else {
          emitErrorAndClose(websocket, err);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes(16).toString("base64");
      const request = isSecure ? https.request : http2.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate(
          opts.perMessageDeflate !== true ? opts.perMessageDeflate : {},
          false,
          opts.maxPayload
        );
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost)
              delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err) => {
        if (req === null || req[kAborted])
          return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err);
      });
      req.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL2(location, address);
          } catch (e) {
            const err = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket.CONNECTING)
          return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt)
          websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse(secWebSocketExtensions);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate.extensionName]);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          websocket._extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err) {
      websocket._readyState = WebSocket.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket.CLOSING;
      const err = new Error(message);
      Error.captureStackTrace(err, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err);
      } else {
        stream.destroy(err);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket)
          websocket._sender._bufferedBytes += length;
        else
          websocket._bufferedAmount += length;
      }
      if (cb) {
        const err = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0)
        return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005)
        websocket.close();
      else
        websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused)
        websocket._socket.resume();
    }
    function receiverOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong)
        websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket.CLOSED)
        return;
      if (websocket.readyState === WebSocket.OPEN) {
        websocket._readyState = WebSocket.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        websocket._closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket.CLOSING;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
        const chunk = this.read(this._readableState.length);
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket.CLOSING;
        this.destroy();
      }
    }
  }
});

// node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "node_modules/ws/lib/stream.js"(exports2, module2) {
    "use strict";
    var WebSocket = require_websocket();
    var { Duplex } = require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err);
      }
    }
    function createWebSocketStream(ws, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data))
          ws.pause();
      });
      ws.once("error", function error(err) {
        if (duplex.destroyed)
          return;
        terminateOnDestroy = false;
        duplex.destroy(err);
      });
      ws.once("close", function close() {
        if (duplex.destroyed)
          return;
        duplex.push(null);
      });
      duplex._destroy = function(err, callback) {
        if (ws.readyState === ws.CLOSED) {
          callback(err);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws.once("error", function error(err2) {
          called = true;
          callback(err2);
        });
        ws.once("close", function close() {
          if (!called)
            callback(err);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy)
          ws.terminate();
      };
      duplex._final = function(callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._final(callback);
          });
          return;
        }
        if (ws._socket === null)
          return;
        if (ws._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted)
            duplex.destroy();
        } else {
          ws._socket.once("finish", function finish() {
            callback();
          });
          ws.close();
        }
      };
      duplex._read = function() {
        if (ws.isPaused)
          ws.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module2.exports = createWebSocketStream;
  }
});

// node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "node_modules/ws/lib/subprotocol.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1)
            start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1)
            end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1)
            end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module2.exports = { parse };
  }
});

// node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "node_modules/ws/lib/websocket-server.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events");
    var http2 = require("http");
    var { Duplex } = require("stream");
    var { createHash } = require("crypto");
    var extension = require_extension();
    var PerMessageDeflate = require_permessage_deflate();
    var subprotocol = require_subprotocol();
    var WebSocket = require_websocket();
    var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer = class extends EventEmitter {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
       *     wait for the closing handshake to finish after `websocket.close()` is
       *     called
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          closeTimeout: CLOSE_TIMEOUT,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http2.createServer((req, res) => {
            const body = http2.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head) => {
              this.handleUpgrade(req, socket, head, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true)
          options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server)
          return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb)
          this.once("close", cb);
        if (this._state === CLOSING)
          return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index = req.url.indexOf("?");
          const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
          if (pathname !== this.options.path)
            return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head, cb) {
        socket.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (version !== 13 && version !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol.parse(secWebSocketProtocol);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate(
            this.options.perMessageDeflate,
            true,
            this.options.maxPayload
          );
          try {
            const offers = extension.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate.extensionName]);
              extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
            }
          } catch (err) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info))
            return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
        if (!socket.readable || !socket.writable)
          return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING)
          return abortHandshake(socket, 503);
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate.extensionName]) {
          const params = extensions[PerMessageDeflate.extensionName].params;
          const value = extension.format({
            [PerMessageDeflate.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws.setSocket(socket, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws);
          ws.on("close", () => {
            this.clients.delete(ws);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws, req);
      }
    };
    module2.exports = WebSocketServer;
    function addListeners(server, map) {
      for (const event of Object.keys(map))
        server.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server) {
      server._state = CLOSED;
      server.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers) {
      message = message || http2.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http2.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server, req, socket, code, message, headers) {
      if (server.listenerCount("wsClientError")) {
        const err = new Error(message);
        Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
        server.emit("wsClientError", err, socket, req);
      } else {
        abortHandshake(socket, code, message, headers);
      }
    }
  }
});

// node_modules/ws/index.js
var require_ws = __commonJS({
  "node_modules/ws/index.js"(exports2, module2) {
    "use strict";
    var WebSocket = require_websocket();
    WebSocket.createWebSocketStream = require_stream();
    WebSocket.Server = require_websocket_server();
    WebSocket.Receiver = require_receiver();
    WebSocket.Sender = require_sender();
    WebSocket.WebSocket = WebSocket;
    WebSocket.WebSocketServer = WebSocket.Server;
    module2.exports = WebSocket;
  }
});

// main_scripts/cdp-handler.js
var require_cdp_handler = __commonJS({
  "main_scripts/cdp-handler.js"(exports2, module2) {
    var WebSocket = require_ws();
    var http2 = require("http");
    var fs2 = require("fs");
    var path2 = require("path");
    var DEFAULT_BASE_PORT = 9e3;
    var DEFAULT_PORT_RANGE = 3;
    function normalizePort(value, fallback = DEFAULT_BASE_PORT) {
      const num = Number(value);
      if (!Number.isFinite(num))
        return fallback;
      const port = Math.trunc(num);
      if (port < 1 || port > 65535)
        return fallback;
      return port;
    }
    function normalizePortRange(value, fallback = DEFAULT_PORT_RANGE) {
      const num = Number(value);
      if (!Number.isFinite(num))
        return fallback;
      const range = Math.trunc(num);
      if (range < 0 || range > 32)
        return fallback;
      return range;
    }
    var _autoAcceptScript = null;
    function getAutoAcceptScript() {
      if (_autoAcceptScript)
        return _autoAcceptScript;
      const candidates = [
        path2.join(__dirname, "auto-accept.js"),
        path2.join(__dirname, "main_scripts", "auto-accept.js"),
        path2.join(__dirname, "..", "main_scripts", "auto-accept.js")
      ];
      for (const scriptPath of candidates) {
        if (fs2.existsSync(scriptPath)) {
          _autoAcceptScript = fs2.readFileSync(scriptPath, "utf8");
          return _autoAcceptScript;
        }
      }
      throw new Error(`auto-accept.js not found. __dirname=${__dirname}`);
    }
    var CDPHandler = class {
      constructor(logger = console.log) {
        this.logger = logger;
        this.connections = /* @__PURE__ */ new Map();
        this.isEnabled = false;
        this.msgId = 1;
        this._lastConfigHash = "";
        this.basePort = DEFAULT_BASE_PORT;
        this.portRange = DEFAULT_PORT_RANGE;
      }
      log(msg) {
        this.logger(`[CDP] ${msg}`);
      }
      getPortCandidates(basePort = this.basePort, portRange = this.portRange) {
        const base = normalizePort(basePort, DEFAULT_BASE_PORT);
        const range = normalizePortRange(portRange, DEFAULT_PORT_RANGE);
        const ports = [];
        for (let port = base - range; port <= base + range; port++) {
          if (port >= 1 && port <= 65535) {
            ports.push(port);
          }
        }
        return ports;
      }
      async getAvailablePorts(portCandidates = null) {
        const candidates = Array.isArray(portCandidates) && portCandidates.length > 0 ? [...new Set(portCandidates.map((p) => normalizePort(p, 0)).filter((p) => p > 0))] : this.getPortCandidates();
        const available = [];
        for (const port of candidates) {
          try {
            const pages = await this._getPages(port);
            if (pages.length > 0) {
              available.push(port);
            }
          } catch (e) {
          }
        }
        return available;
      }
      async isCDPAvailable(port = this.basePort, portRange = this.portRange) {
        const candidates = this.getPortCandidates(port, portRange);
        for (const port2 of candidates) {
          try {
            const pages = await this._getPages(port2);
            if (pages.length > 0)
              return true;
          } catch (e) {
          }
        }
        return false;
      }
      async start(config) {
        this.isEnabled = true;
        this.basePort = normalizePort(config?.cdpPort, this.basePort);
        this.portRange = normalizePortRange(config?.cdpPortRange, this.portRange);
        const candidates = this.getPortCandidates(this.basePort, this.portRange);
        const candidateSet = new Set(candidates);
        for (const [id, conn] of Array.from(this.connections.entries())) {
          const port = Number(String(id).split(":")[0]);
          if (!candidateSet.has(port)) {
            try {
              conn.ws.close();
            } catch (e) {
            }
            this.connections.delete(id);
          }
        }
        const quiet = !!config?.quiet;
        const configHash = JSON.stringify({
          b: !!config?.isBackgroundMode,
          i: String(config?.ide || ""),
          bc: Array.isArray(config?.bannedCommands) ? config.bannedCommands.length : 0,
          p: this.basePort,
          r: this.portRange
        });
        if (!quiet || this._lastConfigHash !== configHash) {
          this.log(`Scanning ports ${candidates[0]} to ${candidates[candidates.length - 1]}...`);
          this.log(`Config: background=${config.isBackgroundMode}, ide=${config.ide}`);
        }
        this._lastConfigHash = configHash;
        for (const port of candidates) {
          try {
            const pages = await this._getPages(port);
            if (pages.length > 0) {
              const newTargets = pages.filter((p) => !this.connections.has(`${port}:${p.id}`));
              if (!quiet || newTargets.length > 0) {
                this.log(`Port ${port}: ${pages.length} page(s) found`);
              }
              for (const page of pages) {
                const id = `${port}:${page.id}`;
                if (!this.connections.has(id)) {
                  await this._connect(id, page.webSocketDebuggerUrl);
                }
                await this._inject(id, config);
              }
            }
          } catch (e) {
          }
        }
      }
      async stop() {
        this.isEnabled = false;
        for (const [id, conn] of this.connections) {
          try {
            await this._evaluate(id, "if(window.__autoAcceptStop) window.__autoAcceptStop()");
            conn.mode = null;
            conn.ws.close();
          } catch (e) {
          }
        }
        this.connections.clear();
      }
      async _getPages(port) {
        return new Promise((resolve, reject) => {
          const req = http2.get({
            hostname: "127.0.0.1",
            port,
            path: "/json/list",
            timeout: 500
          }, (res) => {
            let body = "";
            res.on("data", (chunk) => body += chunk);
            res.on("end", () => {
              try {
                const pages = JSON.parse(body);
                const filtered = pages.filter((p) => {
                  if (!p.webSocketDebuggerUrl)
                    return false;
                  if (p.type !== "page" && p.type !== "webview")
                    return false;
                  const url = (p.url || "").toLowerCase();
                  if (url.startsWith("devtools://") || url.startsWith("chrome-devtools://"))
                    return false;
                  return true;
                });
                resolve(filtered);
              } catch (e) {
                resolve([]);
              }
            });
          });
          req.on("error", () => resolve([]));
          req.on("timeout", () => {
            req.destroy();
            resolve([]);
          });
        });
      }
      async _connect(id, url) {
        return new Promise((resolve) => {
          const ws = new WebSocket(url);
          const timeout = setTimeout(() => {
            try {
              ws.terminate();
            } catch (e) {
            }
            resolve(false);
          }, 3e3);
          ws.on("open", () => {
            clearTimeout(timeout);
            this.connections.set(id, { ws, injected: false, mode: null });
            this.log(`Connected to page ${id}`);
            resolve(true);
          });
          ws.on("error", () => {
            clearTimeout(timeout);
            resolve(false);
          });
          ws.on("close", () => {
            clearTimeout(timeout);
            this.connections.delete(id);
            this.log(`Disconnected from page ${id}`);
          });
        });
      }
      async _inject(id, config) {
        const conn = this.connections.get(id);
        if (!conn)
          return;
        const mode = config.isBackgroundMode ? "background" : "simple";
        const quiet = !!config?.quiet;
        try {
          if (conn.injected) {
            try {
              const existsRes = await this._evaluate(id, 'typeof window.__autoAcceptStart === "function"');
              const exists = !!existsRes?.result?.value;
              if (!exists) {
                conn.injected = false;
                conn.mode = null;
                if (!quiet) {
                  this.log(`Script missing in ${id}; reinjecting...`);
                }
              }
            } catch (e) {
              conn.injected = false;
              conn.mode = null;
            }
          }
          if (!conn.injected) {
            const script = getAutoAcceptScript();
            if (!quiet) {
              this.log(`Injecting script into ${id} (${(script.length / 1024).toFixed(1)}KB)...`);
            }
            await this._safeEvaluate(id, script, 1);
            conn.injected = true;
            if (!quiet) {
              this.log(`Script injected into ${id}`);
            }
          }
          if (conn.mode !== null && conn.mode !== mode) {
            this.log(`Mode changed from ${conn.mode} to ${mode}, restarting...`);
            await this._safeEvaluate(id, "if(window.__autoAcceptStop) window.__autoAcceptStop()", 1);
          }
          let isRunning = true;
          try {
            const runningRes = await this._safeEvaluate(id, "!!(window.__autoAcceptFreeState && window.__autoAcceptFreeState.isRunning)", 1);
            isRunning = !!runningRes?.result?.value;
          } catch (e) {
            isRunning = false;
          }
          if (conn.mode !== mode || !isRunning) {
            const configJson = JSON.stringify({
              ide: config.ide,
              isBackgroundMode: mode === "background",
              bannedCommands: config.bannedCommands || []
            });
            if (!quiet) {
              this.log(`Calling __autoAcceptStart in ${id}`);
            }
            await this._safeEvaluate(id, `if(window.__autoAcceptStart) window.__autoAcceptStart(${configJson})`, 1);
            conn.mode = mode;
          }
        } catch (e) {
          this.log(`Failed to inject into ${id}: ${e.message}`);
        }
      }
      async _safeEvaluate(id, expression, retries = 0) {
        let attempts = 0;
        while (true) {
          try {
            return await this._evaluate(id, expression);
          } catch (e) {
            if (attempts >= retries)
              throw e;
            attempts += 1;
            await new Promise((r) => setTimeout(r, 120));
          }
        }
      }
      async _evaluate(id, expression) {
        const conn = this.connections.get(id);
        if (!conn || conn.ws.readyState !== WebSocket.OPEN)
          return;
        return new Promise((resolve, reject) => {
          const currentId = this.msgId++;
          const timeout = setTimeout(() => {
            conn.ws.off("message", onMessage);
            reject(new Error("CDP Timeout"));
          }, 4500);
          const onMessage = (data) => {
            try {
              const msg = JSON.parse(data.toString());
              if (msg.id === currentId) {
                conn.ws.off("message", onMessage);
                clearTimeout(timeout);
                resolve(msg.result);
              }
            } catch (e) {
            }
          };
          conn.ws.on("message", onMessage);
          try {
            conn.ws.send(JSON.stringify({
              id: currentId,
              method: "Runtime.evaluate",
              params: { expression, userGesture: true, awaitPromise: true }
            }));
          } catch (e) {
            conn.ws.off("message", onMessage);
            clearTimeout(timeout);
            reject(e);
          }
        });
      }
      getConnectionCount() {
        return this.connections.size;
      }
      async getStats() {
        const stats = { clicks: 0, permissions: 0, blocked: 0, fileEdits: 0, terminalCommands: 0, lastAction: "", lastActionLabel: "" };
        for (const [id] of this.connections) {
          try {
            const res = await this._evaluate(id, "JSON.stringify(window.__autoAcceptGetStats ? window.__autoAcceptGetStats() : {})");
            if (res?.result?.value) {
              const s = JSON.parse(res.result.value);
              stats.clicks += s.clicks || 0;
              stats.permissions += s.permissions || 0;
              stats.blocked += s.blocked || 0;
              stats.fileEdits += s.fileEdits || 0;
              stats.terminalCommands += s.terminalCommands || 0;
              if (s.lastActionLabel) {
                stats.lastAction = s.lastAction || "";
                stats.lastActionLabel = s.lastActionLabel || "";
              }
            }
          } catch (e) {
          }
        }
        return stats;
      }
    };
    module2.exports = { CDPHandler };
  }
});

// extension.js
var vscode = require("vscode");
var fs = require("fs");
var path = require("path");
var os = require("os");
var http = require("http");
var { spawn, spawnSync } = require("child_process");
var isEnabled = false;
var backgroundModeEnabled = false;
var pollTimer;
var statusBarItem;
var statusBackgroundItem;
var statusControlPanelItem;
var outputChannel;
var currentIDE = "unknown";
var globalContext;
var cdpHandler;
var runtimeSafeCommands = [];
var runtimeCommandRefreshTimer;
var lastBackgroundToggleTs = 0;
var cdpRefreshTimer;
var lastStatsLogTs = 0;
var lastAntigravityDiscoveryLogTs = 0;
var antigravityDiscoveredCommands = [];
var controlPanel = null;
var cdpPort = 9e3;
var savedLauncherPath = "";
var savedLauncherPort = 0;
var pauseOnCdpMismatch = true;
var antigravityExecutablePath = "";
var cursorExecutablePath = "";
var lastCdpMismatchNotificationTs = 0;
var lastControlPanelStatePushTs = 0;
var cdpRuntimeStatus = {
  state: "unknown",
  message: "",
  expectedPort: 9e3,
  activePorts: [],
  connected: false,
  mcp: null
};
var lastMcpDiscovery = {
  checkedAt: 0,
  found: false,
  url: "",
  port: 0,
  reachable: false
};
var DEFAULT_CDP_PORT = 9e3;
var CDP_SCAN_RANGE = 3;
var SAVED_LAUNCHER_PATH_KEY = "auto-accept-free-saved-launcher-path-v1";
var SAVED_LAUNCHER_PORT_KEY = "auto-accept-free-saved-launcher-port-v1";
var ANTIGRAVITY_EXECUTABLE_PATH_KEY = "antigravityExecutablePath";
var CURSOR_EXECUTABLE_PATH_KEY = "cursorExecutablePath";
var CDP_MISMATCH_NOTIFY_COOLDOWN_MS = 3e4;
var SETUP_PROMPT_SNOOZE_MS = 6 * 60 * 60 * 1e3;
var SETUP_RETRY_SNOOZE_MS = 10 * 60 * 1e3;
var MCP_DISCOVERY_CACHE_MS = 5e3;
var DEVTOOLS_MARKER_MAX_AGE_MS = 10 * 60 * 1e3;
var pollFrequency = 500;
var bannedCommands = [];
var ACCEPT_COMMANDS_VSCODE = [
  "workbench.action.chat.acceptAllFiles",
  "workbench.action.chat.acceptFile",
  "workbench.action.chat.insertCodeBlock",
  "workbench.action.chat.runInTerminal",
  "workbench.action.terminal.runSelectedText"
];
var ACCEPT_COMMANDS_CURSOR = [
  "cursorai.action.acceptAndRunGenerateInTerminal",
  "cursorai.action.acceptGenerateInTerminal",
  "cursorai.action.applyCodeBlock"
];
var ACCEPT_COMMANDS_ANTIGRAVITY = [
  "antigravity.command.accept",
  "antigravity.agent.acceptAgentStep",
  "antigravity.interactiveCascade.acceptSuggestedAction",
  "antigravity.terminalCommand.accept",
  "antigravity.terminalCommand.run",
  "antigravity.executeCascadeAction",
  "antigravity.command.continue",
  "antigravity.agent.continue",
  "antigravity.command.continueGenerating",
  "antigravity.continueGenerating",
  "antigravity.command.alwaysAllow",
  "antigravity.agent.alwaysAllow",
  "antigravity.permission.alwaysAllow",
  "antigravity.browser.alwaysAllow",
  "antigravity.command.allowOnce",
  "antigravity.permission.allowOnce",
  "antigravity.agent.allowOnce"
];
var BLOCKED_DYNAMIC_COMMAND_PARTS = [
  "open",
  "show",
  "allowlist",
  "browser",
  "setting",
  "settings",
  "manage",
  "documentation",
  "docs",
  "login",
  "import",
  "toggle",
  "debug",
  "profile",
  "reloadwindow",
  "issue",
  "quicksettings",
  "onboarding",
  "customize",
  "marketplace",
  "sendchat",
  "create",
  "delete",
  "download",
  "upload"
];
var ALLOWED_DYNAMIC_COMMAND_PARTS = [
  "accept",
  "continue",
  "retry",
  "proceed",
  "allowonce",
  "alwaysallow",
  "permission.allow",
  "executecascadeaction",
  "tabjumpaccept",
  "supercompleteaccept",
  "acceptsuggestedaction",
  "terminalcommand.run",
  "terminalcommand.accept",
  "acknowledgement",
  "agentaccept"
];
function isSafeAntigravityDynamicCommand(cmd) {
  const c = (cmd || "").toLowerCase();
  if (!c.startsWith("antigravity."))
    return false;
  if (BLOCKED_DYNAMIC_COMMAND_PARTS.some((part) => c.includes(part)))
    return false;
  if (ALLOWED_DYNAMIC_COMMAND_PARTS.some((part) => c.includes(part)))
    return true;
  if (c.includes("acceptagentstep"))
    return true;
  if (c.includes("submitcodeacknowledgement"))
    return true;
  if (c.includes("run") && (c.includes("terminalcommand") || c.includes("agent") || c.includes("cascade")))
    return true;
  return false;
}
async function refreshAntigravityDiscoveredCommands() {
  const ide = (currentIDE || "").toLowerCase();
  if (ide !== "antigravity") {
    antigravityDiscoveredCommands = [];
    return;
  }
  try {
    const allCommands = await vscode.commands.getCommands(true);
    antigravityDiscoveredCommands = allCommands.filter(isSafeAntigravityDynamicCommand);
    const now = Date.now();
    if (now - lastAntigravityDiscoveryLogTs > 1e4) {
      lastAntigravityDiscoveryLogTs = now;
      log(`[AutoCmd] Discovered antigravity commands: ${antigravityDiscoveredCommands.length}`);
      if (antigravityDiscoveredCommands.length > 0) {
        log(`[AutoCmd] Sample: ${antigravityDiscoveredCommands.slice(0, 12).join(", ")}`);
      }
    }
  } catch (err) {
    log(`[AutoCmd] Failed to discover antigravity commands: ${err.message}`);
  }
}
function getAcceptCommandsForIDE() {
  const ide = (currentIDE || "").toLowerCase();
  if (ide === "cursor")
    return ACCEPT_COMMANDS_CURSOR;
  if (ide === "antigravity")
    return ACCEPT_COMMANDS_ANTIGRAVITY;
  return ACCEPT_COMMANDS_VSCODE;
}
async function executeAcceptCommandsForIDE() {
  const ide = (currentIDE || "").toLowerCase();
  if (ide === "antigravity") {
    return;
  }
  const commands = [.../* @__PURE__ */ new Set([...getAcceptCommandsForIDE(), ...runtimeSafeCommands])];
  if (commands.length === 0)
    return;
  await Promise.allSettled(commands.map((cmd) => vscode.commands.executeCommand(cmd)));
}
async function refreshRuntimeSafeCommands() {
  const ide = (currentIDE || "").toLowerCase();
  if (ide === "antigravity") {
    runtimeSafeCommands = [];
    await refreshAntigravityDiscoveredCommands();
    return;
  }
  try {
    const allCommands = await vscode.commands.getCommands(true);
    runtimeSafeCommands = allCommands.filter((cmd) => {
      const c = (cmd || "").toLowerCase();
      if (ide === "cursor") {
        return c.startsWith("cursorai.") && c.includes("accept");
      }
      return c.startsWith("workbench.action.chat.") && c.includes("accept");
    });
    log(`[AutoCmd] Runtime safe commands: ${runtimeSafeCommands.length}`);
  } catch (err) {
    log(`[AutoCmd] Failed to enumerate runtime commands: ${err.message}`);
  }
}
function log(message) {
  try {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().split("T")[1].split(".")[0];
    const logLine = `[${timestamp}] ${message}`;
    console.log(logLine);
    if (outputChannel) {
      outputChannel.appendLine(logLine);
    }
  } catch (e) {
    console.error("Logging failed:", e);
  }
}
function detectIDE() {
  const appName = vscode.env.appName || "";
  if (appName.toLowerCase().includes("antigravity"))
    return "Antigravity";
  if (appName.toLowerCase().includes("cursor"))
    return "Cursor";
  return "VS Code";
}
function getExtensionHostKind(context = globalContext) {
  try {
    const ext = context?.extension || vscode.extensions.getExtension("pesosz.antigravity-auto-accept");
    if (!ext)
      return "unknown";
    if (ext.extensionKind === vscode.ExtensionKind.UI)
      return "ui";
    if (ext.extensionKind === vscode.ExtensionKind.Workspace)
      return "workspace";
  } catch (err) {
    log(`[Runtime] Failed to detect extension host kind: ${err.message}`);
  }
  return "unknown";
}
function getAntigravityLogsRoot() {
  const appData = process.env.APPDATA || "";
  return appData ? path.join(appData, "Antigravity", "logs") : "";
}
function findLatestAntigravityMcpUrlFromLogs() {
  const logsRoot = getAntigravityLogsRoot();
  if (!logsRoot || !fs.existsSync(logsRoot)) {
    return { found: false, url: "", port: 0 };
  }
  let newestLogPath = "";
  let newestMtime = 0;
  const stack = [logsRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (err) {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile())
        continue;
      if (entry.name !== "Antigravity.log")
        continue;
      if (!full.includes(`${path.sep}google.antigravity${path.sep}`))
        continue;
      try {
        const stat = fs.statSync(full);
        if (stat.mtimeMs > newestMtime) {
          newestMtime = stat.mtimeMs;
          newestLogPath = full;
        }
      } catch (err) {
      }
    }
  }
  if (!newestLogPath) {
    return { found: false, url: "", port: 0 };
  }
  let content = "";
  try {
    content = fs.readFileSync(newestLogPath, "utf8");
  } catch (err) {
    return { found: false, url: "", port: 0 };
  }
  const pattern = /Chrome DevTools MCP URL discovered at (http:\/\/127\.0\.0\.1:(\d+)\/mcp)/gi;
  let match;
  let lastMatch = null;
  while ((match = pattern.exec(content)) !== null) {
    lastMatch = match;
  }
  if (!lastMatch) {
    return { found: false, url: "", port: 0 };
  }
  const url = String(lastMatch[1] || "");
  const port = normalizeCdpPort(lastMatch[2], 0);
  if (!url || !port) {
    return { found: false, url: "", port: 0 };
  }
  return { found: true, url, port };
}
async function isMcpEndpointReachable(mcpUrl) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(mcpUrl);
    } catch (err) {
      resolve(false);
      return;
    }
    const req = http.get({
      hostname: parsed.hostname,
      port: Number(parsed.port || 80),
      path: parsed.pathname || "/mcp",
      timeout: 900,
      headers: {
        Accept: "text/event-stream"
      }
    }, (res) => {
      const ok = res.statusCode === 200 || res.statusCode === 406;
      res.resume();
      resolve(ok);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}
async function detectAntigravityMcpEndpoint() {
  const now = Date.now();
  if (now - lastMcpDiscovery.checkedAt < MCP_DISCOVERY_CACHE_MS) {
    return { ...lastMcpDiscovery };
  }
  const latest = findLatestAntigravityMcpUrlFromLogs();
  if (!latest.found) {
    lastMcpDiscovery = {
      checkedAt: now,
      found: false,
      url: "",
      port: 0,
      reachable: false
    };
    return { ...lastMcpDiscovery };
  }
  const reachable = await isMcpEndpointReachable(latest.url);
  lastMcpDiscovery = {
    checkedAt: now,
    found: true,
    url: latest.url,
    port: latest.port,
    reachable
  };
  log(`[Setup] MCP discovery: url=${latest.url} reachable=${reachable}`);
  return { ...lastMcpDiscovery };
}
function normalizeCdpPort(value, fallback = DEFAULT_CDP_PORT) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const port = Math.trunc(parsed);
  if (port < 1 || port > 65535) {
    return fallback;
  }
  return port;
}
function readAntigravityDevToolsMarker() {
  const appDataDir = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const markerPath = path.join(appDataDir, "Antigravity", "DevToolsActivePort");
  if (!fs.existsSync(markerPath)) {
    return { found: false, path: markerPath, port: 0, browserPath: "", ageMs: Number.POSITIVE_INFINITY };
  }
  try {
    const stat = fs.statSync(markerPath);
    const raw = fs.readFileSync(markerPath, "utf8");
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const port = normalizeCdpPort(lines[0], 0);
    return {
      found: port > 0,
      path: markerPath,
      port,
      browserPath: lines[1] || "",
      ageMs: Date.now() - stat.mtimeMs
    };
  } catch (err) {
    return { found: false, path: markerPath, port: 0, browserPath: "", ageMs: Number.POSITIVE_INFINITY };
  }
}
function getCdpPortCandidates(preferredPort) {
  const expected = normalizeCdpPort(preferredPort, DEFAULT_CDP_PORT);
  const candidates = /* @__PURE__ */ new Set([expected, 9e3, 9222, 9229]);
  for (let offset = -CDP_SCAN_RANGE; offset <= CDP_SCAN_RANGE; offset++) {
    const port = expected + offset;
    if (port >= 1 && port <= 65535) {
      candidates.add(port);
    }
  }
  return [...candidates].sort((a, b) => a - b);
}
async function detectCdpRuntimeStatus(expectedPort = cdpPort) {
  const expected = normalizeCdpPort(expectedPort, DEFAULT_CDP_PORT);
  const expectedReady = await isCDPPortReady(expected, 900);
  const activePorts = [];
  const candidates = getCdpPortCandidates(expected);
  const isAntigravity = (currentIDE || "").toLowerCase() === "antigravity";
  const antigravityExeInfo = isAntigravity ? resolveEditorExecutable("antigravity") : null;
  const antigravityRunning = process.platform === "win32" && antigravityExeInfo ? isWindowsProcessRunning(antigravityExeInfo) : false;
  const devToolsMarker = isAntigravity ? readAntigravityDevToolsMarker() : null;
  const markerMatchesExpected = !!(devToolsMarker?.found && devToolsMarker.port === expected && devToolsMarker.ageMs <= DEVTOOLS_MARKER_MAX_AGE_MS && antigravityRunning);
  for (const port of candidates) {
    if (port === expected && (expectedReady || markerMatchesExpected)) {
      activePorts.push(port);
      continue;
    }
    const ready = await isCDPPortReady(port, 400);
    if (ready) {
      activePorts.push(port);
    }
  }
  const connected = !!(cdpHandler && cdpHandler.getConnectionCount() > 0);
  const otherActivePorts = activePorts.filter((port) => port !== expected);
  let state = "ok";
  let message = `CDP ready on port ${expected}.`;
  let mcp = null;
  if (!expectedReady && !markerMatchesExpected && otherActivePorts.length > 0) {
    state = "wrong_port";
    message = `CDP is active on ${otherActivePorts.join(", ")} but expected port is ${expected}.`;
  } else if (!expectedReady && !markerMatchesExpected) {
    state = "not_ready";
    message = `CDP is not active on port ${expected}.`;
  } else if ((expectedReady || markerMatchesExpected) && !connected && isAntigravity) {
    state = "connecting";
    message = markerMatchesExpected ? `Antigravity reports DevTools on port ${expected}; waiting for panel target connection.` : `CDP is on port ${expected}, waiting for panel target connection.`;
  }
  if (!expectedReady && !markerMatchesExpected && isAntigravity) {
    const mcpInfo = await detectAntigravityMcpEndpoint();
    if (mcpInfo.found) {
      state = "mcp_only";
      message = mcpInfo.reachable ? `Antigravity MCP endpoint detected on port ${mcpInfo.port}; CDP /json endpoint was not found on ${expected}.` : `Antigravity MCP endpoint was discovered recently (${mcpInfo.url}), but is not reachable now; CDP /json endpoint was not found on ${expected}.`;
      mcp = { url: mcpInfo.url, port: mcpInfo.port, reachable: mcpInfo.reachable };
    }
  }
  return {
    state,
    message,
    expectedPort: expected,
    activePorts,
    connected,
    mcp
  };
}
function markCdpRuntimeStatus(status) {
  cdpRuntimeStatus = status || cdpRuntimeStatus;
}
function maybeNotifyCdpMismatch(status) {
  if (!pauseOnCdpMismatch)
    return;
  if (!isEnabled)
    return;
  if ((currentIDE || "").toLowerCase() !== "antigravity")
    return;
  if (status?.state === "mcp_only")
    return;
  if (!status || status.state !== "wrong_port" && status.state !== "not_ready")
    return;
  const now = Date.now();
  if (now - lastCdpMismatchNotificationTs < CDP_MISMATCH_NOTIFY_COOLDOWN_MS) {
    return;
  }
  lastCdpMismatchNotificationTs = now;
  vscode.window.showWarningMessage(`Auto Accept paused: ${status.message} Open "Antigravity Auto Accept: Open Control Panel" to fix.`);
}
function normalizeExecutablePath(value) {
  return String(value || "").trim();
}
function getExecutablePathConfigKey(ideName) {
  const ide = String(ideName || "").toLowerCase();
  if (ide === "antigravity")
    return ANTIGRAVITY_EXECUTABLE_PATH_KEY;
  if (ide === "cursor")
    return CURSOR_EXECUTABLE_PATH_KEY;
  return "";
}
function getConfiguredExecutablePath(ideName) {
  const key = getExecutablePathConfigKey(ideName);
  if (key === ANTIGRAVITY_EXECUTABLE_PATH_KEY) {
    return antigravityExecutablePath;
  }
  if (key === CURSOR_EXECUTABLE_PATH_KEY) {
    return cursorExecutablePath;
  }
  return "";
}
function setConfiguredExecutablePath(ideName, nextPath) {
  const normalized = normalizeExecutablePath(nextPath);
  const key = getExecutablePathConfigKey(ideName);
  if (key === ANTIGRAVITY_EXECUTABLE_PATH_KEY) {
    antigravityExecutablePath = normalized;
  } else if (key === CURSOR_EXECUTABLE_PATH_KEY) {
    cursorExecutablePath = normalized;
  }
}
function validateConfiguredExecutablePath(exeInfo, candidatePath = "") {
  const configuredPath = normalizeExecutablePath(candidatePath || exeInfo?.configuredPath || getConfiguredExecutablePath(exeInfo?.ide));
  if (!configuredPath) {
    return {
      hasOverride: false,
      valid: true,
      path: "",
      error: ""
    };
  }
  let stat = null;
  try {
    stat = fs.statSync(configuredPath);
  } catch (err) {
    return {
      hasOverride: true,
      valid: false,
      path: configuredPath,
      error: `Configured ${exeInfo?.appName || "IDE"} path does not exist: ${configuredPath}`
    };
  }
  if (process.platform === "win32") {
    if (!stat.isFile() || path.extname(configuredPath).toLowerCase() !== ".exe") {
      return {
        hasOverride: true,
        valid: false,
        path: configuredPath,
        error: `Configured ${exeInfo?.appName || "IDE"} path must point to an existing .exe file: ${configuredPath}`
      };
    }
  } else if (process.platform === "darwin") {
    const isAppBundle = stat.isDirectory() && /\.app$/i.test(configuredPath);
    if (!(stat.isFile() || isAppBundle)) {
      return {
        hasOverride: true,
        valid: false,
        path: configuredPath,
        error: `Configured ${exeInfo?.appName || "IDE"} path must point to an existing app bundle or executable: ${configuredPath}`
      };
    }
  } else if (!stat.isFile()) {
    return {
      hasOverride: true,
      valid: false,
      path: configuredPath,
      error: `Configured ${exeInfo?.appName || "IDE"} path must point to an existing executable file: ${configuredPath}`
    };
  }
  return {
    hasOverride: true,
    valid: true,
    path: configuredPath,
    error: ""
  };
}
function resolveDefaultWindowsExecutable(exeInfo) {
  if (!exeInfo)
    return "";
  const candidates = Array.isArray(exeInfo.exeCandidates) && exeInfo.exeCandidates.length > 0 ? exeInfo.exeCandidates : [exeInfo.exePath];
  for (const exePath of candidates) {
    if (exePath && fs.existsSync(exePath)) {
      return exePath;
    }
  }
  return "";
}
function getExecutablePreferenceState(exeInfo) {
  if (!exeInfo) {
    return {
      configuredPath: "",
      displayPath: "-",
      source: "unavailable",
      hasOverride: false,
      valid: false,
      message: "Executable path controls are not available for this IDE."
    };
  }
  const configured = validateConfiguredExecutablePath(exeInfo);
  if (configured.hasOverride) {
    return {
      configuredPath: configured.path,
      displayPath: configured.path,
      source: "manual",
      hasOverride: true,
      valid: configured.valid,
      message: configured.valid ? `Using manual ${exeInfo.appName} path override.` : configured.error
    };
  }
  if (process.platform === "win32") {
    const detectedPath = resolveDefaultWindowsExecutable(exeInfo);
    return {
      configuredPath: "",
      displayPath: detectedPath || (exeInfo.exeCandidates || []).join("\n"),
      source: "auto",
      hasOverride: false,
      valid: !!detectedPath,
      message: detectedPath ? `Auto-detected ${exeInfo.appName} at ${detectedPath}.` : `${exeInfo.appName} was not found in default locations. Choose the executable path manually.`
    };
  }
  if (process.platform === "darwin") {
    const appName = exeInfo.macAppName || exeInfo.appName || "Antigravity";
    return {
      configuredPath: "",
      displayPath: appName,
      source: "auto",
      hasOverride: false,
      valid: true,
      message: `Auto-launch uses macOS app name "${appName}". Choose a manual app or binary path only if needed.`
    };
  }
  const commandName = exeInfo.linuxCommand || exeInfo.appName || "antigravity";
  return {
    configuredPath: "",
    displayPath: commandName,
    source: "auto",
    hasOverride: false,
    valid: true,
    message: `Auto-launch uses command "${commandName}" from PATH. Choose a manual executable path only if needed.`
  };
}
function escapeSingleQuotedPowerShellString(input) {
  return `'${escapePowerShellSingleQuoted(input)}'`;
}
function resolveEditorExecutable(ideName) {
  const ide = String(ideName || "").toLowerCase();
  if (ide === "antigravity") {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    return {
      ide: "antigravity",
      appName: "Antigravity",
      exePath: path.join(localAppData, "Programs", "Antigravity", "Antigravity.exe"),
      exeCandidates: [
        path.join(localAppData, "Programs", "Antigravity", "Antigravity.exe"),
        path.join(localAppData, "Programs", "antigravity", "Antigravity.exe"),
        path.join(programFiles, "Antigravity", "Antigravity.exe"),
        path.join(programFilesX86, "Antigravity", "Antigravity.exe")
      ],
      configuredPath: getConfiguredExecutablePath("antigravity"),
      configKey: ANTIGRAVITY_EXECUTABLE_PATH_KEY,
      processName: "Antigravity.exe",
      macAppName: "Antigravity",
      linuxCommand: "antigravity"
    };
  }
  if (ide === "cursor") {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    return {
      ide: "cursor",
      appName: "Cursor",
      exePath: path.join(localAppData, "Programs", "cursor", "Cursor.exe"),
      exeCandidates: [
        path.join(localAppData, "Programs", "cursor", "Cursor.exe"),
        path.join(localAppData, "Programs", "Cursor", "Cursor.exe"),
        path.join(programFiles, "Cursor", "Cursor.exe"),
        path.join(programFilesX86, "Cursor", "Cursor.exe")
      ],
      configuredPath: getConfiguredExecutablePath("cursor"),
      configKey: CURSOR_EXECUTABLE_PATH_KEY,
      processName: "Cursor.exe",
      macAppName: "Cursor",
      linuxCommand: "cursor"
    };
  }
  return null;
}
function getDesktopDir() {
  const profileDesktop = path.join(os.homedir(), "Desktop");
  if (fs.existsSync(profileDesktop)) {
    return profileDesktop;
  }
  return process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "Desktop") : profileDesktop;
}
function escapePowerShellSingleQuoted(input) {
  return String(input || "").replace(/'/g, "''");
}
function quoteShArg(arg) {
  return `'${String(arg ?? "").replace(/'/g, "'\\''")}'`;
}
function quoteCmdArg(arg) {
  const text = String(arg ?? "");
  if (text.length === 0) {
    return '""';
  }
  if (/[\s"&()^<>|]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
function buildWindowsArgumentString(args = []) {
  const normalizedArgs = Array.isArray(args) ? args.map((arg) => String(arg ?? "")).filter((arg) => arg.trim().length > 0) : [];
  return normalizedArgs.map(quoteCmdArg).join(" ");
}
function formatSpawnSyncError(result, fallbackMessage) {
  if (!result)
    return fallbackMessage;
  if (result.error?.message) {
    return `${fallbackMessage}: ${result.error.message}`;
  }
  const stderr = result.stderr ? result.stderr.toString().trim() : "";
  const stdout = result.stdout ? result.stdout.toString().trim() : "";
  const detail = stderr || stdout;
  return detail ? `${fallbackMessage}: ${detail}` : fallbackMessage;
}
function getWindowsCommandLineByPid(pid) {
  const pidValue = Number(pid);
  if (!Number.isFinite(pidValue) || pidValue <= 0) {
    return "";
  }
  const psScript = [
    `$proc = Get-CimInstance Win32_Process -Filter "ProcessId=${Math.trunc(pidValue)}" |`,
    " Select-Object -ExpandProperty CommandLine;",
    "if ($proc) { Write-Output $proc }"
  ].join("");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psScript], {
    windowsHide: true
  });
  if (result.status !== 0) {
    return "";
  }
  return result.stdout ? result.stdout.toString().trim() : "";
}
function getWindowsMainProcessCommandLine(exeInfo) {
  if (process.platform !== "win32" || !exeInfo?.processName) {
    return "";
  }
  const hintedPid = Number(process.env.VSCODE_PID || 0);
  const byPid = getWindowsCommandLineByPid(hintedPid);
  if (byPid && byPid.includes(".exe")) {
    return byPid;
  }
  const procName = escapePowerShellSingleQuoted(exeInfo.processName);
  const psScript = [
    `$proc = Get-CimInstance Win32_Process -Filter "Name='${procName}'" |`,
    " Where-Object {",
    "   $_.CommandLine -and",
    "   $_.CommandLine -notmatch '--type=' -and",
    "   $_.CommandLine -notmatch '--node-ipc' -and",
    "   $_.CommandLine -notmatch 'resources\\\\app\\\\extensions\\\\'",
    " } |",
    " Sort-Object CreationDate -Descending |",
    " Select-Object -First 1 -ExpandProperty CommandLine;",
    "if ($proc) { Write-Output $proc }"
  ].join("");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psScript], {
    windowsHide: true
  });
  if (result.status !== 0) {
    return "";
  }
  return result.stdout ? result.stdout.toString().trim() : "";
}
function extractCliOptionValue(commandLine, optionName) {
  if (!commandLine || !optionName) {
    return "";
  }
  const escaped = optionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const eqPattern = new RegExp(`${escaped}=("([^"]+)"|'([^']+)'|([^\\s]+))`, "i");
  const spacedPattern = new RegExp(`${escaped}\\s+("([^"]+)"|'([^']+)'|([^\\s]+))`, "i");
  const eqMatch = commandLine.match(eqPattern);
  if (eqMatch) {
    return eqMatch[2] || eqMatch[3] || eqMatch[4] || "";
  }
  const spacedMatch = commandLine.match(spacedPattern);
  if (spacedMatch) {
    return spacedMatch[2] || spacedMatch[3] || spacedMatch[4] || "";
  }
  return "";
}
function hasCliFlag(commandLine, optionName) {
  if (!commandLine || !optionName) {
    return false;
  }
  const escaped = optionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flagPattern = new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`, "i");
  return flagPattern.test(commandLine);
}
function getWindowsRelaunchArgs(exeInfo) {
  const commandLine = getWindowsMainProcessCommandLine(exeInfo);
  if (!commandLine) {
    return [];
  }
  const args = [];
  const valueOptions = [
    "--user-data-dir",
    "--extensions-dir",
    "--profile",
    "--folder-uri",
    "--file-uri",
    "--remote",
    "--workspace"
  ];
  const flagOptions = [
    "--new-window",
    "--reuse-window"
  ];
  for (const optionName of valueOptions) {
    const optionValue = extractCliOptionValue(commandLine, optionName);
    if (optionValue) {
      args.push(optionName, optionValue);
    }
  }
  for (const flagName of flagOptions) {
    if (hasCliFlag(commandLine, flagName)) {
      args.push(flagName);
    }
  }
  return args;
}
function resolveExistingWindowsExecutable(exeInfo) {
  if (!exeInfo)
    return "";
  const configured = validateConfiguredExecutablePath(exeInfo);
  if (configured.hasOverride) {
    return configured.valid ? configured.path : "";
  }
  return resolveDefaultWindowsExecutable(exeInfo);
}
function isWindowsProcessRunning(exeInfo) {
  if (process.platform !== "win32" || !exeInfo?.processName) {
    return false;
  }
  const result = spawnSync("tasklist", ["/FI", `IMAGENAME eq ${exeInfo.processName}`, "/FO", "CSV", "/NH"], {
    windowsHide: true
  });
  if (result.status !== 0 || result.error) {
    return false;
  }
  const output = result.stdout ? result.stdout.toString().toLowerCase() : "";
  return output.includes(exeInfo.processName.toLowerCase());
}
async function isCDPPortReady(port = cdpPort, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const req = http.get({
      hostname: "127.0.0.1",
      port,
      path: "/json/version",
      timeout: timeoutMs
    }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}
function buildManualLaunchCommand(port = cdpPort) {
  const expectedPort = normalizeCdpPort(port, cdpPort);
  const ide = (currentIDE || "").toLowerCase();
  const exeInfo = resolveEditorExecutable(currentIDE);
  const configured = validateConfiguredExecutablePath(exeInfo);
  if (configured.hasOverride && !configured.valid) {
    return configured.error;
  }
  if (process.platform === "win32") {
    if (configured.valid && configured.path) {
      return `Start-Process ${escapeSingleQuotedPowerShellString(configured.path)} -ArgumentList '--remote-debugging-port=${expectedPort}'`;
    }
    return ide === "antigravity" ? `$exeCandidates = @("$env:LOCALAPPDATA\\Programs\\Antigravity\\Antigravity.exe", "$env:ProgramFiles\\Antigravity\\Antigravity.exe", "$env:ProgramFiles(x86)\\Antigravity\\Antigravity.exe"); $exe = $exeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1; if (-not $exe) { Write-Host 'Antigravity executable not found'; exit 1 }; Start-Process $exe -ArgumentList '--remote-debugging-port=${expectedPort}'` : `$exeCandidates = @("$env:LOCALAPPDATA\\Programs\\cursor\\Cursor.exe", "$env:ProgramFiles\\Cursor\\Cursor.exe", "$env:ProgramFiles(x86)\\Cursor\\Cursor.exe"); $exe = $exeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1; if (-not $exe) { Write-Host 'Cursor executable not found'; exit 1 }; Start-Process $exe -ArgumentList '--remote-debugging-port=${expectedPort}'`;
  }
  if (process.platform === "darwin") {
    if (configured.valid && configured.path) {
      if (/\.app$/i.test(configured.path)) {
        return `open -n ${quoteShArg(configured.path)} --args --remote-debugging-port=${expectedPort}`;
      }
      return `${quoteShArg(configured.path)} --remote-debugging-port=${expectedPort}`;
    }
    return ide === "antigravity" ? `open -n -a Antigravity --args --remote-debugging-port=${expectedPort}` : `open -n -a Cursor --args --remote-debugging-port=${expectedPort}`;
  }
  if (configured.valid && configured.path) {
    return `${quoteShArg(configured.path)} --remote-debugging-port=${expectedPort} >/dev/null 2>&1 &`;
  }
  return ide === "antigravity" ? `antigravity --remote-debugging-port=${expectedPort} >/dev/null 2>&1 &` : `cursor --remote-debugging-port=${expectedPort} >/dev/null 2>&1 &`;
}
function getLauncherFileExtension() {
  if (process.platform === "win32")
    return "lnk";
  if (process.platform === "darwin")
    return "command";
  return "sh";
}
function getLauncherSaveFilters() {
  if (process.platform === "win32")
    return { "Windows Shortcut": ["lnk"] };
  if (process.platform === "darwin")
    return { "Command File": ["command"] };
  return { "Shell Script": ["sh"] };
}
function sanitizeLauncherBaseName(input) {
  return String(input || "IDE").replace(/[\\/:*?"<>|]/g, "").trim() || "IDE";
}
function getDefaultLauncherFileName(exeInfo, port = cdpPort) {
  const safeName = sanitizeLauncherBaseName(exeInfo?.appName || currentIDE || "IDE");
  const ext = getLauncherFileExtension();
  if (process.platform === "linux") {
    return `start-${safeName.toLowerCase().replace(/\s+/g, "-")}-cdp-${port}.${ext}`;
  }
  return `Start ${safeName} (CDP ${port}).${ext}`;
}
function buildPortableLauncherScript(exeInfo, port = cdpPort) {
  const expectedPort = normalizeCdpPort(port, cdpPort);
  const configured = validateConfiguredExecutablePath(exeInfo);
  if (process.platform === "win32") {
    return "";
  }
  if (process.platform === "darwin") {
    if (configured.hasOverride && !configured.valid) {
      return "";
    }
    if (configured.valid && configured.path) {
      if (/\.app$/i.test(configured.path)) {
        return [
          "#!/bin/sh",
          "set -eu",
          `open -n ${quoteShArg(configured.path)} --args --remote-debugging-port=${expectedPort} "$@"`
        ].join("\n") + "\n";
      }
      return [
        "#!/bin/sh",
        "set -eu",
        `nohup ${quoteShArg(configured.path)} --remote-debugging-port=${expectedPort} "$@" >/dev/null 2>&1 &`
      ].join("\n") + "\n";
    }
    const appName = exeInfo?.macAppName || exeInfo?.appName || "Antigravity";
    return [
      "#!/bin/sh",
      "set -eu",
      `open -n -a ${quoteShArg(appName)} --args --remote-debugging-port=${expectedPort} "$@"`
    ].join("\n") + "\n";
  }
  if (configured.hasOverride && !configured.valid) {
    return "";
  }
  if (configured.valid && configured.path) {
    return [
      "#!/usr/bin/env sh",
      "set -eu",
      `nohup ${quoteShArg(configured.path)} --remote-debugging-port=${expectedPort} "$@" >/dev/null 2>&1 &`
    ].join("\n") + "\n";
  }
  const commandName = exeInfo?.linuxCommand || ((currentIDE || "").toLowerCase() === "cursor" ? "cursor" : "antigravity");
  return [
    "#!/usr/bin/env sh",
    "set -eu",
    `if ! command -v ${quoteShArg(commandName)} >/dev/null 2>&1; then`,
    `  echo "Command '${commandName}' not found in PATH." >&2`,
    "  exit 1",
    "fi",
    `nohup ${quoteShArg(commandName)} --remote-debugging-port=${expectedPort} "$@" >/dev/null 2>&1 &`
  ].join("\n") + "\n";
}
function findWindowsShortcutTemplateCandidates(exeInfo, port = cdpPort) {
  const appName = String(exeInfo?.appName || currentIDE || "IDE").trim();
  const normalizedPort = normalizeCdpPort(port, cdpPort);
  const desktopDir = getDesktopDir();
  const candidates = [
    path.join(desktopDir, `${appName} (CDP).lnk`),
    path.join(desktopDir, `${appName} (CDP ${normalizedPort}).lnk`),
    path.join(desktopDir, `Start ${appName} (CDP ${normalizedPort}).lnk`),
    path.join(desktopDir, `Start ${appName} (CDP).lnk`)
  ];
  return [...new Set(candidates.filter(Boolean))];
}
function readWindowsShortcutDetails(shortcutPath) {
  if (!shortcutPath || !fs.existsSync(shortcutPath)) {
    return null;
  }
  const shortcutEsc = escapePowerShellSingleQuoted(shortcutPath);
  const psScript = [
    "$WScriptShell = New-Object -ComObject WScript.Shell",
    `$Shortcut = $WScriptShell.CreateShortcut('${shortcutEsc}')`,
    "$result = [PSCustomObject]@{",
    "  TargetPath = $Shortcut.TargetPath",
    "  Arguments = $Shortcut.Arguments",
    "  WorkingDirectory = $Shortcut.WorkingDirectory",
    "  IconLocation = $Shortcut.IconLocation",
    "}",
    "$result | ConvertTo-Json -Compress"
  ].join(";");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psScript], {
    windowsHide: true
  });
  if (result.status !== 0 || result.error) {
    return null;
  }
  const stdout = result.stdout ? result.stdout.toString().trim() : "";
  if (!stdout) {
    return null;
  }
  try {
    return JSON.parse(stdout);
  } catch (err) {
    return null;
  }
}
function findExistingWindowsShortcutTemplate(exeInfo, port = cdpPort) {
  const normalizedPort = normalizeCdpPort(port, cdpPort);
  const directArg = `--remote-debugging-port=${normalizedPort}`;
  for (const candidate of findWindowsShortcutTemplateCandidates(exeInfo, normalizedPort)) {
    const details = readWindowsShortcutDetails(candidate);
    if (!details) {
      continue;
    }
    if (details.TargetPath && fs.existsSync(details.TargetPath) && String(details.Arguments || "").includes(directArg)) {
      return {
        path: candidate,
        details
      };
    }
  }
  return null;
}
function createWindowsLauncherShortcut(shortcutPath, exeInfo, port = cdpPort, relaunchArgs = []) {
  const expectedPort = normalizeCdpPort(port, cdpPort);
  const template = findExistingWindowsShortcutTemplate(exeInfo, expectedPort);
  const configured = validateConfiguredExecutablePath(exeInfo);
  const extraArgs = Array.isArray(relaunchArgs) ? relaunchArgs.map((arg) => String(arg ?? "")).filter((arg) => arg.trim().length > 0) : [];
  const argumentString = buildWindowsArgumentString([`--remote-debugging-port=${expectedPort}`, ...extraArgs]);
  const canReuseTemplate = !!(template?.path && extraArgs.length === 0 && path.resolve(template.path) !== path.resolve(shortcutPath) && (!configured.hasOverride || configured.valid && template?.details?.TargetPath && path.resolve(template.details.TargetPath) === path.resolve(configured.path)));
  if (canReuseTemplate) {
    fs.copyFileSync(template.path, shortcutPath);
    if (fs.existsSync(shortcutPath)) {
      return {
        path: shortcutPath,
        targetPath: template.details?.TargetPath || "",
        arguments: template.details?.Arguments || argumentString,
        copiedFrom: template.path
      };
    }
  }
  const resolvedExePath = configured.valid && configured.path ? configured.path : template?.details?.TargetPath || resolveExistingWindowsExecutable(exeInfo);
  if (!resolvedExePath) {
    if (configured.hasOverride && !configured.valid) {
      throw new Error(configured.error);
    }
    const candidates = Array.isArray(exeInfo?.exeCandidates) && exeInfo.exeCandidates.length > 0 ? exeInfo.exeCandidates.filter(Boolean) : [exeInfo?.exePath].filter(Boolean);
    throw new Error(
      `Could not find ${exeInfo?.appName || "IDE"} executable. Checked: ${candidates.join(", ")}`
    );
  }
  const shortcutEsc = escapePowerShellSingleQuoted(shortcutPath);
  const targetEsc = escapePowerShellSingleQuoted(resolvedExePath);
  const workingDirectory = template?.details?.WorkingDirectory || path.dirname(resolvedExePath);
  const iconLocation = template?.details?.IconLocation || `${resolvedExePath},0`;
  const workDirEsc = escapePowerShellSingleQuoted(workingDirectory);
  const iconEsc = escapePowerShellSingleQuoted(iconLocation);
  const argsEsc = escapePowerShellSingleQuoted(argumentString);
  const psScript = [
    "$WScriptShell = New-Object -ComObject WScript.Shell",
    `$Shortcut = $WScriptShell.CreateShortcut('${shortcutEsc}')`,
    `$Shortcut.TargetPath = '${targetEsc}'`,
    `$Shortcut.Arguments = '${argsEsc}'`,
    `$Shortcut.WorkingDirectory = '${workDirEsc}'`,
    `$Shortcut.IconLocation = '${iconEsc}'`,
    "$Shortcut.Save()"
  ].join(";");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psScript], {
    windowsHide: true
  });
  if (result.status !== 0 || result.error) {
    throw new Error(formatSpawnSyncError(result, `Failed to create shortcut ${shortcutPath}`));
  }
  if (!fs.existsSync(shortcutPath)) {
    throw new Error(`Shortcut file was not created: ${shortcutPath}`);
  }
  return {
    path: shortcutPath,
    targetPath: resolvedExePath,
    arguments: argumentString
  };
}
async function chooseExecutablePathForCurrentIDE() {
  const exeInfo = resolveEditorExecutable(currentIDE);
  if (!exeInfo) {
    return { ok: false, error: `Executable path override is not available for ${currentIDE}.` };
  }
  const configuredPath = normalizeExecutablePath(getConfiguredExecutablePath(exeInfo.ide));
  const defaultFsPath = configuredPath || (process.platform === "win32" ? exeInfo.exePath : os.homedir());
  const canSelectFolders = process.platform === "darwin";
  const filters = process.platform === "win32" ? { Executable: ["exe"] } : void 0;
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    canSelectFiles: true,
    canSelectFolders,
    openLabel: "Use This Path",
    title: `Select ${exeInfo.appName} ${process.platform === "darwin" ? "app or executable" : "executable"}`,
    defaultUri: vscode.Uri.file(defaultFsPath),
    filters
  });
  if (!uris || uris.length === 0) {
    return { ok: false, canceled: true };
  }
  const selectedPath = uris[0].fsPath;
  const validation = validateConfiguredExecutablePath(exeInfo, selectedPath);
  if (!validation.valid) {
    return { ok: false, error: validation.error };
  }
  await vscode.workspace.getConfiguration("autoAcceptFree").update(exeInfo.configKey, selectedPath, vscode.ConfigurationTarget.Global);
  setConfiguredExecutablePath(exeInfo.ide, selectedPath);
  return {
    ok: true,
    path: selectedPath,
    appName: exeInfo.appName
  };
}
async function clearExecutablePathForCurrentIDE() {
  const exeInfo = resolveEditorExecutable(currentIDE);
  if (!exeInfo) {
    return { ok: false, error: `Executable path override is not available for ${currentIDE}.` };
  }
  await vscode.workspace.getConfiguration("autoAcceptFree").update(exeInfo.configKey, "", vscode.ConfigurationTarget.Global);
  setConfiguredExecutablePath(exeInfo.ide, "");
  return {
    ok: true,
    appName: exeInfo.appName
  };
}
function buildLauncherManualSteps(savedPath, port = cdpPort) {
  if (!savedPath) {
    return "No launcher saved yet.";
  }
  const expectedPort = normalizeCdpPort(port, cdpPort);
  const folderPath = path.dirname(savedPath);
  const fileName = path.basename(savedPath);
  if (process.platform === "win32") {
    return [
      `1. Open File Explorer and go to: ${folderPath}`,
      `2. Double-click: ${fileName}`,
      `3. Always launch the IDE through this file when you want CDP port ${expectedPort}.`,
      "4. Optional: create a shortcut/pin from this file for easier access."
    ].join("\n");
  }
  if (process.platform === "darwin") {
    return [
      `1. Open Finder and go to: ${folderPath}`,
      `2. Run: ${fileName}`,
      "3. First run may require Right click -> Open -> Open (macOS Gatekeeper).",
      `4. Always launch the IDE with this file when you want CDP port ${expectedPort}.`
    ].join("\n");
  }
  return [
    `1. Open a terminal in: ${folderPath}`,
    `2. Run: "${savedPath}"`,
    '3. If needed, make sure it is executable: chmod +x "<saved launcher path>".',
    `4. Always launch the IDE with this file when you want CDP port ${expectedPort}.`
  ].join("\n");
}
async function saveLauncherForPort(port = cdpPort) {
  const expectedPort = normalizeCdpPort(port, cdpPort);
  const exeInfo = resolveEditorExecutable(currentIDE);
  if (!exeInfo) {
    return { ok: false, error: `Launcher creation is not available for ${currentIDE}.` };
  }
  const configured = validateConfiguredExecutablePath(exeInfo);
  if (configured.hasOverride && !configured.valid) {
    return { ok: false, error: configured.error };
  }
  const ext = getLauncherFileExtension();
  const defaultName = getDefaultLauncherFileName(exeInfo, expectedPort);
  const preferredTarget = savedLauncherPath && path.extname(savedLauncherPath).toLowerCase() === `.${ext}` ? savedLauncherPath : path.join(os.homedir(), defaultName);
  const saveUri = await vscode.window.showSaveDialog({
    saveLabel: "Save IDE Launcher",
    defaultUri: vscode.Uri.file(preferredTarget),
    filters: getLauncherSaveFilters()
  });
  if (!saveUri) {
    return { ok: false, canceled: true };
  }
  const targetPath = saveUri.fsPath;
  try {
    if (process.platform === "win32") {
      const relaunchArgs = getWindowsRelaunchArgs(exeInfo);
      createWindowsLauncherShortcut(targetPath, exeInfo, expectedPort, relaunchArgs);
    } else {
      const launcherScript = buildPortableLauncherScript(exeInfo, expectedPort);
      if (!launcherScript) {
        return { ok: false, error: "Failed to build launcher script content." };
      }
      fs.writeFileSync(targetPath, launcherScript, "utf8");
      fs.chmodSync(targetPath, 493);
    }
  } catch (err) {
    return { ok: false, error: `Failed to save launcher: ${err.message}` };
  }
  savedLauncherPath = targetPath;
  savedLauncherPort = expectedPort;
  if (globalContext) {
    await globalContext.globalState.update(SAVED_LAUNCHER_PATH_KEY, savedLauncherPath);
    await globalContext.globalState.update(SAVED_LAUNCHER_PORT_KEY, savedLauncherPort);
  }
  const instructions = buildLauncherManualSteps(savedLauncherPath, savedLauncherPort);
  return {
    ok: true,
    path: savedLauncherPath,
    port: savedLauncherPort,
    instructions
  };
}
function getControlPanelHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      --bg: #0f1217;
      --panel: #151b23;
      --panel-2: #1c2430;
      --txt: #e6edf3;
      --muted: #9aa7b5;
      --accent: #2f81f7;
      --ok: #2ea043;
      --warn: #d29922;
      --bad: #f85149;
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 16px; font-family: "Segoe UI", system-ui, sans-serif; background: radial-gradient(1200px 500px at -20% -20%, #223146 0%, var(--bg) 48%); color: var(--txt); }
    .wrap { max-width: 960px; margin: 0 auto; display: grid; gap: 12px; }
    .card { background: linear-gradient(165deg, var(--panel), var(--panel-2)); border: 1px solid #2b3342; border-radius: 12px; padding: 12px; }
    .head { display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
    h1 { margin: 0; font-size: 18px; font-weight: 650; letter-spacing: 0.2px; }
    .muted { color: var(--muted); font-size: 12px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 8px; }
    .stat { border: 1px solid #2b3342; border-radius: 10px; padding: 10px; background: #10161f; }
    .k { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; }
    .v { margin-top: 4px; font-size: 13px; word-break: break-word; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: end; }
    label { font-size: 12px; color: var(--muted); display: grid; gap: 6px; }
    input[type="number"] { width: 140px; padding: 8px; background: #0f141c; border: 1px solid #2b3342; border-radius: 8px; color: var(--txt); }
    .toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
    button { border: 0; border-radius: 8px; padding: 8px 10px; color: #fff; background: #2a3342; cursor: pointer; }
    button.primary { background: var(--accent); }
    button.good { background: #1f6b37; }
    button.warn { background: #8a6517; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .status { padding: 8px 10px; border-radius: 8px; font-size: 12px; border: 1px solid #2b3342; background: #111820; }
    .ok { color: #a7f3b6; border-color: #1f6b37; }
    .warnc { color: #fcd58f; border-color: #8a6517; }
    .bad { color: #ffb2ab; border-color: #8c2f2b; }
    pre { margin: 0; white-space: pre-wrap; font-size: 11px; color: #b8c5d3; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="head">
        <h1>Antigravity Auto Accept Control Panel</h1>
        <button id="refresh">Refresh</button>
      </div>
      <div class="muted">Choose CDP port, save a launcher file anywhere on your machine, and follow the exact open steps.</div>
    </div>

    <div class="card">
      <div id="status" class="status">Loading...</div>
      <div class="grid" style="margin-top:10px;">
        <div class="stat"><div class="k">IDE</div><div id="ide" class="v">-</div></div>
        <div class="stat"><div class="k">Platform</div><div id="platform" class="v">-</div></div>
        <div class="stat"><div class="k">Remote Context</div><div id="remote" class="v">-</div></div>
        <div class="stat"><div class="k">Extension Host</div><div id="hostKind" class="v">-</div></div>
        <div class="stat"><div class="k">Expected CDP Port</div><div id="portValue" class="v">-</div></div>
        <div class="stat"><div class="k">Active CDP Ports</div><div id="ports" class="v">-</div></div>
        <div class="stat"><div class="k">CDP Connections</div><div id="connections" class="v">-</div></div>
      </div>
    </div>

    <div class="card">
      <div class="row">
        <label>CDP Port
          <input id="portInput" type="number" min="1" max="65535" step="1" />
        </label>
        <button class="primary" id="savePort">Save Port</button>
        <button class="good" id="saveLauncher">Save IDE Launcher...</button>
      </div>
      <div class="row" style="margin-top:8px;">
        <label class="toggle"><input id="pauseOnMismatch" type="checkbox" /> Pause when CDP port mismatch is detected</label>
      </div>
    </div>

    <div class="card">
      <div class="k">Executable Path Override</div>
      <pre id="executablePath">-</pre>
      <div class="muted" id="executablePathMeta" style="margin-top:6px;">Auto-detect status: -</div>
      <div class="row" style="margin-top:10px;">
        <button id="chooseExecutable">Choose IDE Path...</button>
        <button class="warn" id="clearExecutable">Clear Manual Path</button>
      </div>
    </div>

    <div class="card">
      <div class="row">
        <button class="primary" id="toggleAuto">Toggle Auto Accept</button>
        <button id="toggleBg">Toggle Background Mode</button>
      </div>
      <div class="muted" style="margin-top:8px;">Auto Accept: <span id="enabled">-</span> | Background: <span id="background">-</span></div>
    </div>

    <div class="card">
      <div class="k">Saved Launcher Path</div>
      <pre id="savedLauncherPath">-</pre>
      <div class="muted" id="savedLauncherPort" style="margin-top:6px;">Launcher port: -</div>
      <div class="k" style="margin-top:10px;">How To Open It</div>
      <pre id="launcherSteps">Save a launcher first to get platform-specific steps.</pre>
    </div>

    <div class="card">
      <div class="k">Manual Command (Alternative)</div>
      <pre id="manualCmd">-</pre>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const byId = (id) => document.getElementById(id);
    let renderedPortValue = '';
    let portInputDirty = false;

    function post(type, payload = {}) {
      vscode.postMessage({ type, ...payload });
    }

    function parsePortInputValue() {
      return Number(String(byId('portInput').value || '').trim());
    }

    function refreshPortDraftState() {
      portInputDirty = String(byId('portInput').value || '') !== renderedPortValue;
    }

    function setStatus(text, kind) {
      const el = byId('status');
      el.textContent = text;
      el.className = 'status ' + (kind || '');
    }

    function render(state) {
      byId('ide').textContent = state.ide || '-';
      byId('platform').textContent = state.platform || '-';
      byId('remote').textContent = state.remoteName || 'local';
      byId('hostKind').textContent = state.extensionHostKind || 'unknown';
      byId('portValue').textContent = String(state.cdpPort || '-');
      byId('ports').textContent = (state.cdpStatus?.activePorts || []).length ? state.cdpStatus.activePorts.join(', ') : 'none';
      byId('connections').textContent = String(state.connectionCount || 0);
      byId('enabled').textContent = state.isEnabled ? 'ON' : 'OFF';
      byId('background').textContent = state.backgroundModeEnabled ? 'ON' : 'OFF';
      byId('manualCmd').textContent = state.manualLaunchCommand || '-';
      byId('savedLauncherPath').textContent = state.savedLauncherPath || '-';
      byId('savedLauncherPort').textContent = state.savedLauncherPath ? ('Launcher port: ' + String(state.savedLauncherPort || '-')) : 'Launcher port: -';
      byId('launcherSteps').textContent = state.launcherSteps || 'Save a launcher first to get platform-specific steps.';
      renderedPortValue = String(state.cdpPort || '');
      // Keep the user's in-progress draft while the panel auto-refreshes in the background.
      if (!portInputDirty) {
        byId('portInput').value = renderedPortValue;
      }
      byId('pauseOnMismatch').checked = !!state.pauseOnCdpMismatch;
      byId('executablePath').textContent = state.executablePath || '-';
      byId('executablePathMeta').textContent = (state.executablePathSource ? ('Source: ' + state.executablePathSource + ' | ') : '') + (state.executablePathMessage || '-');
      byId('clearExecutable').disabled = !state.hasExecutableOverride;

      const s = state.cdpStatus || {};
      const draftPort = parsePortInputValue();
      const invalidDraftPort = !Number.isInteger(draftPort) || draftPort < 1 || draftPort > 65535;
      byId('savePort').disabled = invalidDraftPort;
      byId('saveLauncher').disabled = invalidDraftPort || !!(state.hasExecutableOverride && !state.executablePathValid);
      if (s.state === 'ok') setStatus(s.message || 'CDP is ready.', 'ok');
      else if (s.state === 'connecting') setStatus(s.message || 'CDP is starting.', 'warnc');
      else if (s.state === 'mcp_only') setStatus(s.message || 'MCP mode detected; fixed CDP launcher is not available.', 'warnc');
      else if (s.state === 'wrong_port') setStatus(s.message || 'Wrong CDP port.', 'bad');
      else setStatus(s.message || 'CDP is not ready.', 'warnc');
    }

    window.addEventListener('message', (event) => {
      const msg = event.data || {};
      if (msg.type === 'state') {
        render(msg.state || {});
      }
    });

    byId('refresh').addEventListener('click', () => post('refresh'));
    byId('portInput').addEventListener('input', () => refreshPortDraftState());
    byId('portInput').addEventListener('blur', () => refreshPortDraftState());
    byId('savePort').addEventListener('click', () => {
      const port = parsePortInputValue();
      renderedPortValue = String(port);
      portInputDirty = false;
      post('savePort', { port });
    });
    byId('saveLauncher').addEventListener('click', () => post('saveLauncher', { port: parsePortInputValue() }));
    byId('chooseExecutable').addEventListener('click', () => post('chooseExecutable'));
    byId('clearExecutable').addEventListener('click', () => post('clearExecutable'));
    byId('toggleAuto').addEventListener('click', () => post('toggleAuto'));
    byId('toggleBg').addEventListener('click', () => post('toggleBackground'));
    byId('pauseOnMismatch').addEventListener('change', (e) => post('setPauseOnMismatch', { value: !!e.target.checked }));

    post('ready');
    setInterval(() => post('refresh'), 4000);
  </script>
</body>
</html>`;
}
async function buildControlPanelState() {
  const status = await detectCdpRuntimeStatus(cdpPort);
  markCdpRuntimeStatus(status);
  const extensionHostKind = getExtensionHostKind(globalContext);
  const launcherPort = normalizeCdpPort(savedLauncherPort || cdpPort, cdpPort);
  const launcherSteps = buildLauncherManualSteps(savedLauncherPath, launcherPort);
  const exeInfo = resolveEditorExecutable(currentIDE);
  const executableState = getExecutablePreferenceState(exeInfo);
  return {
    ide: currentIDE,
    platform: process.platform,
    remoteName: vscode.env.remoteName || "",
    extensionHostKind,
    isEnabled,
    backgroundModeEnabled,
    cdpPort,
    pauseOnCdpMismatch,
    cdpStatus: status,
    connectionCount: cdpHandler ? cdpHandler.getConnectionCount() : 0,
    manualLaunchCommand: buildManualLaunchCommand(cdpPort),
    savedLauncherPath,
    savedLauncherPort: launcherPort,
    launcherSteps,
    executablePath: executableState.displayPath,
    executablePathSource: executableState.source,
    executablePathMessage: executableState.message,
    hasExecutableOverride: executableState.hasOverride,
    executablePathValid: executableState.valid
  };
}
async function postControlPanelState() {
  if (!controlPanel)
    return;
  try {
    const state = await buildControlPanelState();
    controlPanel.webview.postMessage({ type: "state", state });
    updateStatusBar();
  } catch (err) {
    log(`[Panel] Failed to post state: ${err.message}`);
  }
}
async function openControlPanel(context) {
  if (controlPanel) {
    controlPanel.reveal(vscode.ViewColumn.Active);
    await postControlPanelState();
    return;
  }
  controlPanel = vscode.window.createWebviewPanel(
    "autoAcceptControlPanel",
    "Antigravity Auto Accept: Control Panel",
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );
  controlPanel.webview.html = getControlPanelHtml();
  controlPanel.onDidDispose(() => {
    controlPanel = null;
  }, null, context.subscriptions);
  controlPanel.webview.onDidReceiveMessage(async (msg) => {
    if (!msg || typeof msg.type !== "string")
      return;
    try {
      if (msg.type === "ready" || msg.type === "refresh") {
        await postControlPanelState();
        return;
      }
      if (msg.type === "savePort") {
        const newPort = normalizeCdpPort(msg.port, cdpPort);
        await vscode.workspace.getConfiguration("autoAcceptFree").update("cdpPort", newPort, vscode.ConfigurationTarget.Global);
        cdpPort = newPort;
        if (isEnabled) {
          await restartPolling();
        }
        vscode.window.showInformationMessage(`CDP port set to ${newPort}.`);
        await postControlPanelState();
        return;
      }
      if (msg.type === "chooseExecutable") {
        const result = await chooseExecutablePathForCurrentIDE();
        if (!result.ok) {
          if (!result.canceled) {
            vscode.window.showErrorMessage(`Executable path update failed: ${result.error}`);
          }
        } else {
          vscode.window.showInformationMessage(`${result.appName} executable path set to:
${result.path}`);
        }
        await postControlPanelState();
        return;
      }
      if (msg.type === "clearExecutable") {
        const result = await clearExecutablePathForCurrentIDE();
        if (!result.ok) {
          vscode.window.showErrorMessage(`Executable path reset failed: ${result.error}`);
        } else {
          vscode.window.showInformationMessage(`${result.appName} executable path override cleared.`);
        }
        await postControlPanelState();
        return;
      }
      if (msg.type === "setPauseOnMismatch") {
        const value = !!msg.value;
        await vscode.workspace.getConfiguration("autoAcceptFree").update("pauseOnCdpMismatch", value, vscode.ConfigurationTarget.Global);
        pauseOnCdpMismatch = value;
        updateStatusBar();
        await postControlPanelState();
        return;
      }
      if (msg.type === "saveLauncher") {
        const launcherPort = normalizeCdpPort(msg.port, cdpPort);
        log(`[Launcher] Save requested for port ${launcherPort}`);
        const result = await saveLauncherForPort(launcherPort);
        if (!result.ok) {
          if (!result.canceled) {
            vscode.window.showErrorMessage(`Save launcher failed: ${result.error}`);
          }
        } else {
          const infoText = `Launcher saved at:
${result.path}

How to open:
${result.instructions}`;
          const infoAction = await vscode.window.showInformationMessage(infoText, { modal: true }, "Copy Steps");
          if (infoAction === "Copy Steps") {
            await vscode.env.clipboard.writeText(result.instructions);
          }
        }
        await postControlPanelState();
        return;
      }
      if (msg.type === "launchWithPort" || msg.type === "setup") {
        vscode.window.showWarningMessage("Launch/setup actions were removed from this panel. Save a launcher file and open the IDE through it.");
        return;
      }
      if (msg.type === "toggleAuto") {
        await handleToggle(globalContext);
        await postControlPanelState();
        return;
      }
      if (msg.type === "toggleBackground") {
        await handleBackgroundToggle(globalContext);
        await postControlPanelState();
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Control panel error: ${err.message}`);
    }
  }, null, context.subscriptions);
  await postControlPanelState();
}
async function activate(context) {
  globalContext = context;
  console.log("Antigravity Auto Accept: Activating...");
  try {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = "auto-accept-free.toggle";
    statusBarItem.text = "$(sync~spin) Auto Accept: Loading...";
    statusBarItem.tooltip = "Antigravity Auto Accept is initializing...";
    context.subscriptions.push(statusBarItem);
    statusBarItem.show();
    statusBackgroundItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    statusBackgroundItem.command = "auto-accept-free.toggleBackground";
    statusBackgroundItem.text = "$(globe) Background: OFF";
    statusBackgroundItem.tooltip = "Background mode works across all agent chats";
    context.subscriptions.push(statusBackgroundItem);
    statusControlPanelItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
    statusControlPanelItem.command = "auto-accept-free.openControlPanel";
    statusControlPanelItem.text = "$(tools) Auto Accept Panel";
    statusControlPanelItem.tooltip = "Open Antigravity Auto Accept Control Panel";
    context.subscriptions.push(statusControlPanelItem);
    statusControlPanelItem.show();
    const config = vscode.workspace.getConfiguration("autoAcceptFree");
    pollFrequency = config.get("pollInterval", 500);
    cdpPort = normalizeCdpPort(config.get("cdpPort", DEFAULT_CDP_PORT), DEFAULT_CDP_PORT);
    pauseOnCdpMismatch = !!config.get("pauseOnCdpMismatch", true);
    antigravityExecutablePath = normalizeExecutablePath(config.get(ANTIGRAVITY_EXECUTABLE_PATH_KEY, ""));
    cursorExecutablePath = normalizeExecutablePath(config.get(CURSOR_EXECUTABLE_PATH_KEY, ""));
    bannedCommands = config.get("bannedCommands", [
      "rm -rf /",
      "rm -rf ~",
      "rm -rf *",
      "format c:",
      "del /f /s /q",
      "rmdir /s /q",
      ":(){:|:&};:",
      "dd if=",
      "mkfs.",
      "> /dev/sda",
      "chmod -R 777 /"
    ]);
    const savedEnabled = context.globalState.get("auto-accept-free-enabled", false);
    isEnabled = !!savedEnabled;
    backgroundModeEnabled = context.globalState.get("auto-accept-free-background", false);
    savedLauncherPath = String(context.globalState.get(SAVED_LAUNCHER_PATH_KEY, "") || "");
    savedLauncherPort = normalizeCdpPort(context.globalState.get(SAVED_LAUNCHER_PORT_KEY, cdpPort), cdpPort);
    currentIDE = detectIDE();
    outputChannel = vscode.window.createOutputChannel("Antigravity Auto Accept");
    context.subscriptions.push(outputChannel);
    log(`Antigravity Auto Accept: Detected ${currentIDE}`);
    log(`Poll interval: ${pollFrequency}ms`);
    log(`CDP port: ${cdpPort}`);
    log(`Pause on mismatch: ${pauseOnCdpMismatch}`);
    if (antigravityExecutablePath) {
      log(`Antigravity executable override: ${antigravityExecutablePath}`);
    }
    if (cursorExecutablePath) {
      log(`Cursor executable override: ${cursorExecutablePath}`);
    }
    if (savedLauncherPath) {
      log(`Saved launcher path: ${savedLauncherPath} (port ${savedLauncherPort})`);
    }
    log(`Blocked command patterns: ${bannedCommands.length}`);
    await refreshRuntimeSafeCommands();
    if (runtimeCommandRefreshTimer) {
      clearInterval(runtimeCommandRefreshTimer);
      runtimeCommandRefreshTimer = null;
    }
    runtimeCommandRefreshTimer = setInterval(() => {
      refreshRuntimeSafeCommands();
    }, 15e3);
    context.subscriptions.push({
      dispose: () => {
        if (runtimeCommandRefreshTimer) {
          clearInterval(runtimeCommandRefreshTimer);
          runtimeCommandRefreshTimer = null;
        }
      }
    });
    try {
      const { CDPHandler } = require_cdp_handler();
      cdpHandler = new CDPHandler(log);
      log("CDP handler initialized");
    } catch (err) {
      log(`Failed to initialize CDP handler: ${err.message}`);
    }
    updateStatusBar();
    context.subscriptions.push(
      vscode.commands.registerCommand("auto-accept-free.toggle", () => handleToggle(context)),
      vscode.commands.registerCommand("auto-accept-free.toggleBackground", () => handleBackgroundToggle(context)),
      vscode.commands.registerCommand("auto-accept-free.setupCDP", () => handleSetupCDP()),
      vscode.commands.registerCommand("auto-accept-free.openControlPanel", () => openControlPanel(context))
    );
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("autoAcceptFree")) {
          const newConfig = vscode.workspace.getConfiguration("autoAcceptFree");
          pollFrequency = newConfig.get("pollInterval", 500);
          cdpPort = normalizeCdpPort(newConfig.get("cdpPort", DEFAULT_CDP_PORT), DEFAULT_CDP_PORT);
          pauseOnCdpMismatch = !!newConfig.get("pauseOnCdpMismatch", true);
          antigravityExecutablePath = normalizeExecutablePath(newConfig.get(ANTIGRAVITY_EXECUTABLE_PATH_KEY, ""));
          cursorExecutablePath = normalizeExecutablePath(newConfig.get(CURSOR_EXECUTABLE_PATH_KEY, ""));
          bannedCommands = newConfig.get("bannedCommands", []);
          log(`Settings updated: ${pollFrequency}ms, cdpPort=${cdpPort}, pauseOnMismatch=${pauseOnCdpMismatch}, antigravityPath=${antigravityExecutablePath || "-"}, cursorPath=${cursorExecutablePath || "-"}`);
          refreshRuntimeSafeCommands();
          if (isEnabled) {
            restartPolling();
          }
          postControlPanelState();
        }
      })
    );
    if (isEnabled) {
      await startPolling();
    }
    log("Startup setup prompts are disabled; use Control Panel -> Save IDE Launcher.");
    log("Antigravity Auto Accept: Activation complete");
  } catch (error) {
    console.error("CRITICAL ACTIVATION ERROR:", error);
    log(`CRITICAL ERROR: ${error.message}`);
    vscode.window.showErrorMessage(`Antigravity Auto Accept failed to activate: ${error.message}`);
  }
}
async function handleToggle(context) {
  log("=== Toggle triggered ===");
  log(`Previous state: ${isEnabled}`);
  try {
    isEnabled = !isEnabled;
    log(`New state: ${isEnabled}`);
    await context.globalState.update("auto-accept-free-enabled", isEnabled);
    updateStatusBar();
    if (isEnabled) {
      log("Auto Accept: ENABLED");
      vscode.window.showInformationMessage("Antigravity Auto Accept is enabled.");
      await startPolling();
    } else {
      log("Auto Accept: DISABLED");
      await stopPolling();
    }
    postControlPanelState();
    log("=== Toggle completed ===");
  } catch (e) {
    log(`Toggle failed: ${e.message}`);
  }
}
async function handleBackgroundToggle(context) {
  const now = Date.now();
  if (now - lastBackgroundToggleTs < 1200) {
    return;
  }
  lastBackgroundToggleTs = now;
  log("Background toggle clicked");
  const cdpAvailable = cdpHandler ? await cdpHandler.isCDPAvailable(cdpPort, CDP_SCAN_RANGE) : false;
  if (!backgroundModeEnabled && !cdpAvailable) {
    vscode.window.showWarningMessage(`Background mode requires CDP on port ${cdpPort}. Run: Antigravity Auto Accept: Setup CDP`);
    return;
  }
  backgroundModeEnabled = !backgroundModeEnabled;
  await context.globalState.update("auto-accept-free-background", backgroundModeEnabled);
  log(`Background mode: ${backgroundModeEnabled}`);
  if (isEnabled) {
    await restartPolling();
  }
  updateStatusBar();
  postControlPanelState();
}
async function handleSetupCDP() {
  const result = await saveLauncherForPort(cdpPort);
  if (!result.ok) {
    if (!result.canceled) {
      vscode.window.showErrorMessage(`Save launcher failed: ${result.error}`);
    }
    postControlPanelState();
    return;
  }
  const infoText = `Launcher saved at:
${result.path}

How to open:
${result.instructions}`;
  const infoAction = await vscode.window.showInformationMessage(infoText, { modal: true }, "Copy Steps");
  if (infoAction === "Copy Steps") {
    await vscode.env.clipboard.writeText(result.instructions);
  }
  postControlPanelState();
}
async function startPolling() {
  if (pollTimer)
    clearInterval(pollTimer);
  log("Auto Accept: Starting polling...");
  await refreshRuntimeSafeCommands();
  await refreshAntigravityDiscoveredCommands();
  const getCdpConfig = (quiet = false) => ({
    isBackgroundMode: backgroundModeEnabled,
    ide: currentIDE,
    bannedCommands,
    pollInterval: pollFrequency,
    cdpPort,
    cdpPortRange: CDP_SCAN_RANGE,
    quiet
  });
  const currentStatus = await detectCdpRuntimeStatus(cdpPort);
  markCdpRuntimeStatus(currentStatus);
  maybeNotifyCdpMismatch(currentStatus);
  updateStatusBar();
  if (cdpHandler) {
    try {
      await cdpHandler.start(getCdpConfig(false));
      if (cdpRefreshTimer) {
        clearInterval(cdpRefreshTimer);
        cdpRefreshTimer = null;
      }
      cdpRefreshTimer = setInterval(() => {
        if (!isEnabled)
          return;
        cdpHandler.start(getCdpConfig(true)).catch(() => {
        });
      }, 1e3);
    } catch (e) {
      log(`CDP unavailable: ${e.message}`);
    }
  }
  if ((currentIDE || "").toLowerCase() === "antigravity") {
    const cdpConnected = !!(cdpHandler && cdpHandler.getConnectionCount() > 0);
    if (!cdpConnected) {
      log(`CDP not connected on expected port ${cdpPort}.`);
    }
  }
  await executeAcceptCommandsForIDE();
  pollTimer = setInterval(async () => {
    if (!isEnabled)
      return;
    try {
      await refreshAntigravityDiscoveredCommands();
      await executeAcceptCommandsForIDE();
      const now = Date.now();
      const status = await detectCdpRuntimeStatus(cdpPort);
      markCdpRuntimeStatus(status);
      maybeNotifyCdpMismatch(status);
      updateStatusBar();
      if (controlPanel && now - lastControlPanelStatePushTs > 2e3) {
        lastControlPanelStatePushTs = now;
        postControlPanelState();
      }
      if (cdpHandler && now - lastStatsLogTs > 5e3) {
        lastStatsLogTs = now;
        try {
          const stats = await cdpHandler.getStats();
          log(`[CDP] Stats clicks=${stats.clicks || 0} permissions=${stats.permissions || 0} blocked=${stats.blocked || 0} files=${stats.fileEdits || 0} terminals=${stats.terminalCommands || 0} lastAction=${stats.lastAction || "-"} lastActionLabel="${(stats.lastActionLabel || "").replace(/"/g, "'")}"`);
        } catch (e) {
        }
      }
      if (bannedCommands.length > 0) {
      }
    } catch (e) {
    }
  }, pollFrequency);
  log(`Polling started: ${pollFrequency}ms`);
}
async function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (cdpRefreshTimer) {
    clearInterval(cdpRefreshTimer);
    cdpRefreshTimer = null;
  }
  if (cdpHandler) {
    await cdpHandler.stop();
  }
  log("Auto Accept: Polling stopped");
}
async function restartPolling() {
  await stopPolling();
  await startPolling();
}
function updateStatusBar() {
  if (!statusBarItem)
    return;
  if (statusBackgroundItem) {
    statusBackgroundItem.backgroundColor = void 0;
    statusBackgroundItem.color = void 0;
  }
  if (statusControlPanelItem) {
    statusControlPanelItem.backgroundColor = void 0;
    statusControlPanelItem.color = void 0;
  }
  if (isEnabled) {
    let statusText = "ON";
    let icon = "$(check)";
    let tooltip = `Antigravity Auto Accept is active (${pollFrequency}ms)`;
    const cdpConnected = cdpHandler && cdpHandler.getConnectionCount() > 0;
    if ((currentIDE || "").toLowerCase() === "antigravity" && pauseOnCdpMismatch && cdpRuntimeStatus && cdpRuntimeStatus.state !== "ok" && cdpRuntimeStatus.state !== "mcp_only") {
      statusText = "PAUSED";
      icon = "$(warning)";
      tooltip = `${cdpRuntimeStatus.message} Open Control Panel to fix.`;
    } else if (cdpConnected) {
      tooltip += " | CDP connected";
    } else if ((currentIDE || "").toLowerCase() === "antigravity") {
      tooltip += " | CDP disconnected";
    }
    statusBarItem.text = `${icon} Auto Accept: ${statusText}`;
    statusBarItem.tooltip = tooltip;
    statusBarItem.backgroundColor = void 0;
    if (statusControlPanelItem) {
      const panelIcon = statusText === "PAUSED" ? "$(warning)" : "$(tools)";
      statusControlPanelItem.text = `${panelIcon} Auto Accept Panel`;
      statusControlPanelItem.tooltip = "Open Antigravity Auto Accept Control Panel";
      statusControlPanelItem.show();
    }
    if (statusBackgroundItem) {
      if (backgroundModeEnabled) {
        statusBackgroundItem.text = "$(sync~spin) Background: ON";
        statusBackgroundItem.tooltip = "Background mode is active";
      } else {
        statusBackgroundItem.text = "$(globe) Background: OFF";
        statusBackgroundItem.tooltip = "Click to enable background mode";
      }
      statusBackgroundItem.show();
    }
  } else {
    statusBarItem.text = "$(circle-slash) Auto Accept: OFF";
    statusBarItem.tooltip = "Click to enable Antigravity Auto Accept";
    statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    if (statusControlPanelItem) {
      statusControlPanelItem.text = "$(tools) Auto Accept Panel";
      statusControlPanelItem.tooltip = "Open Antigravity Auto Accept Control Panel";
      statusControlPanelItem.show();
    }
    if (statusBackgroundItem) {
      statusBackgroundItem.hide();
    }
  }
}
function deactivate() {
  if (controlPanel) {
    try {
      controlPanel.dispose();
    } catch (e) {
    }
    controlPanel = null;
  }
  if (runtimeCommandRefreshTimer) {
    clearInterval(runtimeCommandRefreshTimer);
    runtimeCommandRefreshTimer = null;
  }
  stopPolling();
  if (cdpHandler) {
    cdpHandler.stop();
  }
}
module.exports = { activate, deactivate };
