(() => {
    const requestAnimationFrame =  window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame;
    const cancelAnimationFrame =  window.cancelAnimationFrame || window.webkitCancelAnimationFrame || window.mozCancelAnimationFrame;
    const hasGamepadSupport = window.navigator.getGamepads !== undefined;
    const spaceRegex = /\s+/g;

    const findKeyMapping = (index, mapping) => {
        return Object.entries(mapping)
            .filter((k, v) => v === index || (Array.isArray(v) && v.includes(index)))
            .map((k, v) => k);
    };

    class Gamepad {
        _events = {
            gamepad: [],
            axes: [],
            keyboard: {}
        };
        _handlers = {
            gamepad: {
                connect: null,
                disconnect: null
            }
        };
        _keyMapping = {
            gamepad: {
                'button_1': 0,
                'button_2': 1,
                'button_3': 2,
                'button_4': 3,
                'shoulder_top_left': 4,
                'shoulder_top_right': 5,
                'shoulder_bottom_left': 6,
                'shoulder_bottom_right': 7,
                'select': 8,
                'start': 9,
                'stick_button_left': 10,
                'stick_button_right': 11,
                'd_pad_up': 12,
                'd_pad_down': 13,
                'd_pad_left': 14,
                'd_pad_right': 15,
                'vendor': 16
            },
            axes: {
                'stick_axis_left': [0, 2],
                'stick_axis_right': [2, 4]
            },
            keyboard: {
                'button_1': 32,
                'start': 27,
                'd_pad_up': [ 38, 87 ],
                'd_pad_down': [ 40, 83 ],
                'd_pad_left': [ 37, 65 ],
                'd_pad_right': [ 39, 68 ]
            }
        };
        _threshold = 0.3;
        _listeners = [];

        constructor() {
            _handleKeyboardEventListener = this._handleKeyboardEventListener.bind(this);
            resume();
        }

        _handleGamepadConnected(index) {
            this._handlers.gamepad.connect && this._handlers.gamepad.connect({index});
        }

        _handleGamepadDisconnected(index) {
            this._handlers.gamepad.disconnect && this._handlers.gamepad.disconnect({index});
        }

        _handleGamepadEventListener(controller) {
            if (controller && controller.connected) {
                controller.buttons.forEach((button, index) => {
                    const keys = findKeyMapping(index, this._keyMapping.gamepad) || [];
                    keys.forEach(key => {
                        if (button.pressed) {
                            if (!this._events.gamepad[controller.index][key]) {
                                this._events.gamepad[controller.index][key] = {
                                    pressed: true,
                                    hold: false,
                                    released: false,
                                    player: controller.index
                                };
                            }
                            this._events.gamepad[controller.index][key].value = button.value;
                        } else if (!button.pressed && this._events.gamepad[controller.index][key]) {
                            this._events.gamepad[controller.index][key].released = true;
                            this._events.gamepad[controller.index][key].hold = false;
                        }
                    });
                });
            }
        }

        _handleGamepadAxisEventListener(controller) {
            if (controller && controller.connected) {
                Object.entries(this._keyMapping.axes)
                    .forEach((key, map) => {
                        var axes = Array.from(controller.axes, map);
                        if (Math.abs(axes[0]) > this._threshold || Math.abs(axes[1]) > this._threshold) {
                            this._events.axes[controller.index][key] = {
                                pressed: !this._events.axes[controller.index][key],
                                hold: !!this._events.axes[controller.index][key],
                                released: false,
                                value: axes
                            };
                        } else if (this._events.axes[controller.index][key]) {
                            this._events.axes[controller.index][key] = {
                                pressed: false,
                                hold: false,
                                released: true,
                                value: axes
                            };
                        }
                    });
            }

        }

        _handleKeyboardEventListener(e) {
            const keys = findKeyMapping(e.keyCode, this._keyMapping.keyboard) || [];
            keys.forEach(key => {
                if (e.type === 'keydown' && !this._events.keyboard[key]) {
                    this._events.keyboard[key] = {
                        pressed: true,
                        hold: false,
                        released: false
                    };
                } else if (e.type === 'keyup' && this._events.keyboard[key]) {
                    this._events.keyboard[key] = {
                        ...this._events.keyboard[key],
                        released: true,
                        hold: false
                    };
                }
            });
        }

        _handleEvent(key, events, player) {
            const e = events[key];
            if (e.pressed) {
                this.trigger('press', key, e.value, player);
                e.pressed = false;
                e.hold = true;
            } else if (e.hold) {
                this.trigger('hold', key, e.value, player);
            } else if (e.released) {
                this.trigger('release', key, e.value, player);
                delete events[key];
            }
        }

        _loop() {
            const gamepads = hasGamepadSupport && (Array.from(window.navigator.getGamepads()) || []);
            const length = gamepads.length;
            gamepads.forEach((gamepad, i) => {
                if (gamepad) {
                    if (!this._events.gamepad[i]) {
                        this._handleGamepadConnected(i);
                        this._events.gamepad[i] = {};
                        this._events.axes[i] = {};
                    }
                    this._handleGamepadEventListener(gamepad);
                    this._handleGamepadAxisEventListener(gamepad);
                } else if (this._events.gamepad[i]) {
                    this._handleGamepadDisconnected(i);
                    this._events.gamepad[i] = null;
                    this._events.axes[i] = null;
                }
            });

            ['gamepad', 'axes']
                .forEach(prop => {
                    this._events[prop]
                        .filter(g => !!g)
                        .forEach((gamepad, player) => Object.keys(gamepad)
                            .forEach(key => this._handleEvent(key, gamepad, player)));
                });

            Object.keys(this._events.keyboard)
                .forEach(key => this._handleEvent(key, this._events.keyboard, 'keyboard'));

            this._requestAnimation = _requestAnimationFrame(this._loop.bind(this));
        }

        on(type, button, callback, options) {
            if (Object.keys(this._handlers.gamepad).includes(type) && typeof button === 'function') {
                this._handlers.gamepad[type] = button;
                this._events.gamepad = [];
            } else {
                if (typeof type === "string" && spaceRegex.test(type)) {
                    type = type.split(spaceRegex);
                }

                if (typeof button === "string" && spaceRegex.test(button)) {
                    button = button.split(/\s+/g);
                }

                if (Array.isArray(type)) {
                    type.forEach(t => this.on(t, button, callback, options));
                } else if (Array.isArray(button)) {
                    button.forEach(b => this.on(type, b, callback, options));
                } else {
                    this._listeners.push({ type, button, callback, options });
                }
            }
        }

        off(type, button) {
            if (typeof type === "string" && spaceRegex.test(type)) {
                type = type.split(spaceRegex);
            }

            if (typeof button === "string" && spaceRegex.test(button)) {
                button = button.split(spaceRegex);
            }

            if (Array.isArray(type)) {
                type.forEach(t => this.off(t, button));
            } else if (Array.isArray(button)) {
                button.forEach(b => this.off(type, b));
            } else {
                this._listeners = this._listeners.filter(l => l.type !== type && l.button !== button);
            }
        }

        setCustomMapping(device, config) {
            if (this._keyMapping[device] !== undefined) {
                this._keyMapping[device] = config;
            } else {
                throw new Error(`The device ${device} is not supported through gamepad.js`);
            }
        }

        setGlobalThreshold = num => this._threshold = parseFloat(num);

        trigger(type, button, value, player) {
            if (this._listeners) {
                this._listeners
                    .filter(l => l.type === type && l.button === button)
                    .forEach(l => l.callback({
                        type: l.type,
                        button: l.button,
                        value,
                        player,
                        event: l,
                        timestamp: Date.now()
                    }));
            }
        }

        pause() {
            _cancelAnimationFrame(this._requestAnimation);
            this._requestAnimation = null;
            document.removeEventListener('keydown', this._handleKeyboardEventListener);
            document.removeEventListener('keyup', this._handleKeyboardEventListener);
        }

        resume() {
            this._requestAnimation = _requestAnimationFrame(this._loop.bind(this));
            document.addEventListener('keydown', this._handleKeyboardEventListener);
            document.addEventListener('keyup', this._handleKeyboardEventListener);
        }

        destroy() {
            this.pause();
            this._listeners = null;
            this._events = null;
            this._handlers = null;
        }
    }

    window.Gamepad = new Gamepad();
})();
