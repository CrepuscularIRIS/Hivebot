/**
* Copyright (c) 2025 Bytedance, Inc. and its affiliates.
* SPDX-License-Identifier: Apache-2.0
*/
var types_LogLevel = /*#__PURE__*/ function(LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["SUCCESS"] = 2] = "SUCCESS";
    LogLevel[LogLevel["WARN"] = 3] = "WARN";
    LogLevel[LogLevel["ERROR"] = 4] = "ERROR";
    LogLevel[LogLevel["SILENT"] = 5] = "SILENT";
    return LogLevel;
}({});
class BaseLogger {
    log(...args) {}
    info(...args) {}
    warn(...args) {}
    error(...args) {}
    debug(...args) {}
    success(message) {}
    infoWithData(message, data, transformer) {}
    spawn(subPrefix) {
        return new BaseLogger();
    }
    setLevel(level) {}
    getLevel() {
        return 1;
    }
}
const defaultLogger = new BaseLogger();
var _process_stdout;
const colorize_isBrowser = 'undefined' != typeof window && void 0 !== window.document;
const supportsColor = !colorize_isBrowser && !('NO_COLOR' in process.env || '0' === process.env.FORCE_COLOR) && (void 0 !== process.env.FORCE_COLOR || (null === (_process_stdout = process.stdout) || void 0 === _process_stdout ? void 0 : _process_stdout.isTTY));
const ANSI_COLORS = {
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
    reset: '\x1b[0m'
};
const CSS_COLOR_VALUES = {
    black: '#000000',
    red: '#ff0000',
    green: '#00cc00',
    yellow: '#cc7700',
    blue: '#0066ff',
    magenta: '#cc00cc',
    cyan: '#00aaaa',
    white: '#ffffff',
    gray: '#808080',
    reset: 'inherit'
};
const CSS_COLORS = {};
Object.entries(CSS_COLOR_VALUES).forEach(([key, value])=>{
    CSS_COLORS[key] = `color: ${value}`;
});
function colorize(text, color) {
    if (!text) return text;
    if (colorize_isBrowser) return text;
    if (supportsColor && ANSI_COLORS[color]) return `${ANSI_COLORS[color]}${text}${ANSI_COLORS.reset}`;
    return text;
}
function colorLog(text, color) {
    if (colorize_isBrowser && CSS_COLORS[color]) console.log(`%c${text}`, CSS_COLORS[color]);
    else if (supportsColor) console.log(colorize(text, color));
    else console.log(text);
}
function _define_property(obj, key, value) {
    if (key in obj) Object.defineProperty(obj, key, {
        value: value,
        enumerable: true,
        configurable: true,
        writable: true
    });
    else obj[key] = value;
    return obj;
}
class ConsoleLogger extends BaseLogger {
    colorPrefix(prefix, type) {
        if (!prefix) return '';
        let color = 'gray';
        switch(type){
            case 'info':
                color = 'blue';
                break;
            case 'warn':
                color = 'yellow';
                break;
            case 'error':
                color = 'red';
                break;
            case 'debug':
                color = 'gray';
                break;
            case 'success':
                color = 'green';
                break;
        }
        const isBrowser = 'undefined' != typeof window && void 0 !== window.document;
        if (isBrowser) {
            this.lastPrefixColor = color;
            return prefix;
        }
        return colorize(prefix, color);
    }
    log(...args) {
        if (this.level <= types_LogLevel.DEBUG) console.log(this.colorPrefix(this.prefix), ...args);
    }
    info(...args) {
        if (this.level <= types_LogLevel.INFO) {
            const prefix = this.colorPrefix(this.prefix, 'info');
            if ('undefined' != typeof window && this.lastPrefixColor) {
                console.log(`%c${prefix}%c`, `color: ${CSS_COLOR_VALUES[this.lastPrefixColor]}`, 'color: inherit', ...args);
                this.lastPrefixColor = null;
            } else console.log(`${prefix}`, ...args);
        }
    }
    warn(...args) {
        if (this.level <= types_LogLevel.WARN) {
            const prefix = this.colorPrefix(this.prefix, 'warn');
            if ('undefined' != typeof window && this.lastPrefixColor) {
                console.warn(`%c${prefix}%c`, `color: ${CSS_COLOR_VALUES[this.lastPrefixColor]}`, 'color: inherit', ...args);
                this.lastPrefixColor = null;
            } else console.warn(`${prefix}`, ...args);
        }
    }
    error(...args) {
        if (this.level <= types_LogLevel.ERROR) {
            const prefix = this.colorPrefix(this.prefix, 'error');
            if ('undefined' != typeof window && this.lastPrefixColor) {
                console.error(`%c${prefix}%c`, `color: ${CSS_COLOR_VALUES[this.lastPrefixColor]}`, 'color: inherit', ...args);
                this.lastPrefixColor = null;
            } else console.error(`${prefix}`, ...args);
        }
    }
    success(message) {
        if (this.level <= types_LogLevel.SUCCESS) {
            const prefix = this.colorPrefix(this.prefix, 'success');
            if ('undefined' != typeof window && this.lastPrefixColor) {
                console.log(`%c${prefix}%c ${message}`, `color: ${CSS_COLOR_VALUES[this.lastPrefixColor]}`, 'color: inherit');
                this.lastPrefixColor = null;
            } else console.log(`${prefix} ${message}`);
        }
    }
    infoWithData(message, data, transformer) {
        if (this.level <= types_LogLevel.INFO) {
            this.info(message);
            if (data) console.log(transformer ? transformer(data) : data);
        }
    }
    spawn(prefix) {
        const newPrefix = this.prefix ? `${this.prefix}:${prefix}` : prefix;
        return new ConsoleLogger(newPrefix, this.level);
    }
    setLevel(level) {
        this.level = level;
    }
    getLevel() {
        return this.level;
    }
    constructor(prefix = '', level = types_LogLevel.INFO){
        super(), _define_property(this, "prefix", void 0), _define_property(this, "lastPrefixColor", null), _define_property(this, "level", types_LogLevel.INFO);
        this.prefix = prefix;
        this.level = level;
    }
}
export { BaseLogger, ConsoleLogger, types_LogLevel as LogLevel, colorLog, colorize, defaultLogger };

//# sourceMappingURL=index.mjs.map