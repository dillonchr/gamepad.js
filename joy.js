(() => {
    const requestAnimationFrame =  window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame;
    const cancelAnimationFrame =  window.cancelAnimationFrame || window.webkitCancelAnimationFrame || window.mozCancelAnimationFrame;
    const hasGamepadSupport = window.navigator.getGamepads !== undefined;
    const spaceRegex = /\s+/g;
    let threshold = 0.3;
    let listeners = [];
    let animationFrameId;

    const findKeyMapping = (index, mapping) => {
        return Object.entries(mapping)
            .filter((k, v) => v === index || (Array.isArray(v) && v.includes(index)))
            .map(k => k);
    };

    const events = {
        gamepad: [],
        axes: [],
        keyboard: {}
    };

    const handlers = {
        gamepad: {
            connect: null,
            disconnect: null
        }
    };

    const keyMap = {
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

    const _handleGamepadConnected = index => {
        handlers.gamepad.connect && handlers.gamepad.connect({index});
    };

    const _handleGamepadDisconnected = index => {
        handlers.gamepad.disconnect && handlers.gamepad.disconnect({index});
    };

    const _handleGamepadEventListener = controller => {
        if (controller && controller.connected) {
            controller.buttons.forEach((button, index) => {
                const keys = findKeyMapping(index, keyMap.gamepad) || [];
                keys.forEach(key => {
                    if (button.pressed) {
                        if (!events.gamepad[controller.index][key]) {
                            events.gamepad[controller.index][key] = {
                                pressed: true,
                                hold: false,
                                released: false,
                                player: controller.index
                            };
                        }
                        events.gamepad[controller.index][key].value = button.value;
                    } else if (!button.pressed && events.gamepad[controller.index][key]) {
                        events.gamepad[controller.index][key].released = true;
                        events.gamepad[controller.index][key].hold = false;
                    }
                });
            });
        }
    };

    const _handleGamepadAxisEventListener = controller => {
        if (controller && controller.connected) {
            Object.entries(keyMap.axes)
                .forEach((key, map) => {
                    var axes = Array.from(controller.axes, map);
                    if (Math.abs(axes[0]) > threshold || Math.abs(axes[1]) > threshold) {
                        events.axes[controller.index][key] = {
                            pressed: !events.axes[controller.index][key],
                            hold: !!events.axes[controller.index][key],
                            released: false,
                            value: axes
                        };
                    } else if (events.axes[controller.index][key]) {
                        events.axes[controller.index][key] = {
                            pressed: false,
                            hold: false,
                            released: true,
                            value: axes
                        };
                    }
                });
        }
    };

    const _handleKeyboardEventListener = e => {
        (findKeyMapping(e.keyCode, keyMap.keyboard) || [])
            .forEach(key => {
                if (e.type === 'keydown' && !events.keyboard[key]) {
                    events.keyboard[key] = {
                        pressed: true,
                        hold: false,
                        released: false
                    };
                } else if (e.type === 'keyup' && events.keyboard[key]) {
                    events.keyboard[key] = Object.assign(events.keyboard[key], {
                        released: true,
                        hold: false
                    });
                }
            });
    };

    const _handleEvent = (key, events, player) => {
        const e = events[key];
        if (e.pressed) {
            window.gamepad.trigger('press', key, e.value, player);
            e.pressed = false;
            e.hold = true;
        } else if (e.hold) {
            window.gamepad.trigger('hold', key, e.value, player);
        } else if (e.released) {
            window.gamepad.trigger('release', key, e.value, player);
            delete events[key];
        }
    };

    const _loop = () => {
        const gamepads = (hasGamepadSupport && Array.from(window.navigator.getGamepads())) || [];
        gamepads.forEach((gamepad, i) => {
            if (gamepad) {
                if (!events.gamepad[i]) {
                    _handleGamepadConnected(i);
                    events.gamepad[i] = {};
                    events.axes[i] = {};
                }
                _handleGamepadEventListener(gamepad);
                _handleGamepadAxisEventListener(gamepad);
            } else if (events.gamepad[i]) {
                _handleGamepadDisconnected(i);
                events.gamepad[i] = null;
                events.axes[i] = null;
            }
        });

        ['gamepad', 'axes']
            .forEach(prop => {
                events[prop]
                    .filter(g => !!g)
                    .forEach((gamepad, player) => Object.keys(gamepad)
                        .forEach(key => _handleEvent(key, gamepad, player)));
            });

        Object.keys(events.keyboard)
            .forEach(key => _handleEvent(key, events.keyboard, 'keyboard'));
        animationFrameId = requestAnimationFrame(_loop);
    };

    window.gamepad = {
        on(type, button, callback, options) {
            if (Object.keys(handlers.gamepad).includes(type) && typeof button === 'function') {
                handlers.gamepad[type] = button;
                events.gamepad = [];
            } else {
                if (typeof type === 'string' && spaceRegex.test(type)) {
                    type = type.split(spaceRegex);
                }

                if (typeof button === 'string' && spaceRegex.test(button)) {
                    button = button.split(/\s+/g);
                }

                if (Array.isArray(type)) {
                    type.forEach(t => this.on(t, button, callback, options));
                } else if (Array.isArray(button)) {
                    button.forEach(b => this.on(type, b, callback, options));
                } else {
                    listeners.push({ type, button, callback, options });
                }
            }
        },
        off(type, button) {
            if (typeof type === 'string' && spaceRegex.test(type)) {
                type = type.split(spaceRegex);
            }

            if (typeof button === 'string' && spaceRegex.test(button)) {
                button = button.split(spaceRegex);
            }

            if (Array.isArray(type)) {
                type.forEach(t => this.off(t, button));
            } else if (Array.isArray(button)) {
                button.forEach(b => this.off(type, b));
            } else {
                listeners = listeners.filter(l => l.type !== type && l.button !== button);
            }
        },
        setCustomMapping(device, config) {
            if (keyMap[device] !== undefined) {
                keyMap[device] = config;
            } else {
                throw new Error(`The device ${device} is not supported through gamepad.js`);
            }
        },
        setGlobalThreshold(num) {
            threshold = parseFloat(num);
        },
        trigger(type, button, value, player) {
            if (listeners) {
                listeners
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
        },
        pause() {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
            document.removeEventListener('keydown', _handleKeyboardEventListener);
            document.removeEventListener('keyup', _handleKeyboardEventListener);
        },
        resume() {
            animationFrameId = requestAnimationFrame(_loop);
            document.addEventListener('keydown', _handleKeyboardEventListener);
            document.addEventListener('keyup', _handleKeyboardEventListener);
        },
        destroy() {
            this.pause();
            listeners.length = 0;
            delete events.gamepad;
            delete events.axes;
            delete events.keyboard;
            delete handlers.gamepad;
        }
    };
})();
