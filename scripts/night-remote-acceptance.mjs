// Optional test harness: normal standalone builds do not import the API repo.
export function nightRemoteAcceptancePlugin(options) {
  let delegate;
  return { name: 'optional-remote-night-acceptance', apply: 'serve',
    async config(config, environment) {
      if (environment.command !== 'serve' || process.env.NIGHT_REMOTE_ACCEPTANCE !== '20261107' || options.apiTarget !== 'https://admin-test.buchuqin.com') return;
      const location = new URL('../../buchuqin-api/scripts/remote-night-acceptance/vite-plugin.mjs', import.meta.url).href;
      const module = await import(location);
      delegate = module.nightRemoteAcceptancePlugin(options);
      return delegate.config(config, environment);
    },
    configureServer(server) { return delegate?.configureServer(server); },
  };
}
