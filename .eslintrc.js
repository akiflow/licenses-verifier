module.exports = {
  env: {
    browser: true,
    commonjs: true,
    es2020: true,
    node: true,
    mocha: true
  },
  extends: [
    'standard',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended'
    // 'plugin:@typescript-eslint/recommended'
  ],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
    id: 'readonly',
    q: 'readonly',
    qa: 'readonly',
    cl: 'readonly',
    Sentry: 'readonly',
    initSentry: 'readonly',
    ONBOARDING: 'readonly',
    insertIntoFocusedInput: 'readonly',
    execShellCommand: 'readonly',
    onElementHeightChange: 'readonly',
    DB: 'readonly',
    sleep: 'readonly',
    getRandomItem: 'readonly',
    debounce: 'readonly',
    throttle: 'readonly',
    throttleTrailing: 'readonly',
    sortByKey: 'readonly',
    rand: 'readonly',
    round: 'readonly',
    getImage: 'readonly',
    ALLOW_GLOBAL_KEYDOWN: 'writable',
    gc: 'readonly',
    trayWindow: 'writable',
    cliWindow: 'writable',
    backgroundWindow: 'writable',
    notificationsWindow: 'writable',
    mainWindow: 'writable',
    prepareAkiflowForQuit: 'readonly',
    __MODIFIER_KEY__: 'readonly',
    __IS_MAIN_WINDOW__: 'readonly',
    __IS_CLI_WINDOW__: 'readonly',
    __IS_BACKGROUND_WINDOW__: 'readonly',
    __IS_TRAY_WINDOW__: 'readonly',
    EventListenerOrEventListenerObject: 'readonly'
  },
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint'
  ],
  parserOptions: {
    ecmaVersion: 2020,
    impliedStrict: true
  },
  rules: {
    'no-use-before-define': 'off',
    '@typescript-eslint/no-use-before-define': 'warn',
    // '@typescript-eslint/no-use-before-define': 'warn'
    'import/first': 'off',
    '@typescript-eslint:disable:ordered-imports': 'off',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'error',
    'no-useless-constructor': 'off',
    '@typescript-eslint/array-type': [2, { default: 'generic' }],
    '@typescript-eslint/explicit-member-accessibility': ['error', {
      accessibility: 'explicit',
      ignoredMethodNames: ['render', 'componentDidMount', 'componentDidUpdate', 'componentWillUnmount', 'componentDidCatch', 'shouldComponentUpdate', 'getDerivedStateFromError'],
      overrides: { constructors: 'off', properties: 'off' }
    }],
    'react/function-component-definition': [2, { namedComponents: 'arrow-function', unnamedComponents: 'arrow-function' }]
  },
  overrides: [
    {
      files: ['./src/renderer/db/**/*.js'],
      rules: {
        camelcase: ['off', /^_.*/] // commands/utils exported names
      }
    },
    {
      files: ['./src/renderer/background/Tasks/Sync/*.js'],
      rules: {
        'new-cap': 'off' // cancelToken constructors
      }
    },
    {
      files: ['*.ts', '*.tsx'],
      rules: {
        'no-undef': 'off'
      }
    }
  ],
  settings: {
    react: {
      version: 'detect'
    }
  }
}
