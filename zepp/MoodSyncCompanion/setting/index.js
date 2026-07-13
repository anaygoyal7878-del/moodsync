/**
 * Login/status UI for the MoodSync Side Service. Built against the
 * confirmed AppSettingsPage/Button/View/TextInput API
 * (docs.zepp.com/docs/reference/app-settings-api/ui/). Note: the
 * TextInput reference doesn't document a password/masked variant, so
 * the password field here is plain text — flagged rather than guessed
 * at a `type="password"`-style prop that isn't confirmed to exist.
 */
AppSettingsPage({
  state: {
    email: '',
    password: '',
    loggedIn: false,
    loginError: '',
    lastSyncedAt: '',
  },
  build(props) {
    this.getStorage(props);

    if (!this.state.loggedIn) {
      return View({}, [
        TextInput({
          label: 'MoodSync email',
          placeholder: 'you@example.com',
          value: this.state.email,
          settingsKey: 'email',
        }),
        TextInput({
          label: 'MoodSync password',
          placeholder: 'password',
          value: this.state.password,
          settingsKey: 'password',
        }),
        Button({
          style: { display: 'block', margin: '1em 1em 0 1em', width: 'auto', fontSize: '1.5rem' },
          label: 'Log in',
          color: 'primary',
          onClick: () => this.requestLogin(props),
        }),
        this.state.loginError
          ? View({ style: { margin: '1em', fontSize: '1.2rem', color: 'red' } }, [this.state.loginError])
          : null,
      ]);
    }

    return View({}, [
      View({ style: { margin: '1em', fontSize: '1.2rem' } }, [`Logged in as ${this.state.email}`]),
      this.state.lastSyncedAt
        ? View({ style: { margin: '0 1em', fontSize: '1.2rem' } }, [`Last synced: ${this.state.lastSyncedAt}`])
        : null,
      Button({
        style: { display: 'block', margin: '1em 1em 0 1em', width: 'auto', fontSize: '1.5rem' },
        label: 'Request sync from watch',
        color: 'primary',
        onClick: () => this.requestSync(props),
      }),
      Button({
        style: { display: 'block', margin: '1em 1em 0 1em', width: 'auto', fontSize: '1.5rem' },
        label: 'Log out',
        color: 'secondary',
        onClick: () => this.logout(props),
      }),
    ]);
  },
  getStorage(props) {
    this.state.email = props.settingsStorage.getItem('email') || '';
    this.state.password = props.settingsStorage.getItem('password') || '';
    this.state.loggedIn = Boolean(props.settingsStorage.getItem('loggedIn'));
    this.state.loginError = props.settingsStorage.getItem('loginError') || '';
    this.state.lastSyncedAt = props.settingsStorage.getItem('lastSyncedAt') || '';
  },
  requestLogin(props) {
    const current = props.settingsStorage.getItem('LOGIN_ACTION');
    props.settingsStorage.setItem('LOGIN_ACTION', !current);
  },
  requestSync(props) {
    const current = props.settingsStorage.getItem('REQUEST_SYNC_ACTION');
    props.settingsStorage.setItem('REQUEST_SYNC_ACTION', !current);
  },
  logout(props) {
    props.settingsStorage.setItem('accessToken', '');
    props.settingsStorage.setItem('refreshToken', '');
    props.settingsStorage.setItem('loggedIn', false);
  },
});
