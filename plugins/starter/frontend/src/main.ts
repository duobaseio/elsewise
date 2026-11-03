import { DEFAULT_COMMAND_GROUPS, type Plugin, type PluginInfo } from '@elsewise/frontend-plugin';

export default function ({ id }: PluginInfo): Plugin {
  return {
    onEnable(app) {
      return [
        app.commands.add([
          {
            scope: 'application',
            id: `${id}.greet`,
            group: DEFAULT_COMMAND_GROUPS.application.id,
            label: 'Greet',
            run() {
              console.log('Hello from the starter plugin');
              return true;
            },
          },
        ]),
      ];
    },
  };
}
