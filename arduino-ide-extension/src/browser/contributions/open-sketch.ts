import { inject, injectable } from 'inversify';
import { remote } from 'electron';
import { Disposable } from '@theia/languages/lib/browser';
import { MaybePromise } from '@theia/core/lib/common/types';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { Widget, ContextMenuRenderer } from '@theia/core/lib/browser';
import { ArduinoMenus } from '../menu/arduino-menus';
import { ArduinoToolbar } from '../toolbar/arduino-toolbar';
import { SketchContribution, Sketch, URI, Command, CommandRegistry, MenuModelRegistry, KeybindingRegistry, TabBarToolbarRegistry } from './contribution';

@injectable()
export class OpenSketch extends SketchContribution {

    @inject(MenuModelRegistry)
    protected readonly menuRegistry: MenuModelRegistry;

    @inject(ContextMenuRenderer)
    protected readonly contextMenuRenderer: ContextMenuRenderer;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(OpenSketch.Commands.OPEN_SKETCH, {
            execute: arg => Sketch.is(arg) ? this.openSketch(arg) : this.openSketch()
        });
        registry.registerCommand(OpenSketch.Commands.OPEN_SKETCH__TOOLBAR, {
            isVisible: widget => ArduinoToolbar.is(widget) && widget.side === 'left',
            execute: async (_: Widget, target: EventTarget) => {
                const sketches = await this.sketchService.getSketches();
                if (!sketches.length) {
                    this.openSketch();
                } else {
                    if (!(target instanceof HTMLElement)) {
                        return;
                    }
                    const toDisposeOnClose = new DisposableCollection();
                    this.menuRegistry.registerMenuAction(ArduinoMenus.OPEN_SKETCH__CONTEXT__OPEN_GROUP, {
                        commandId: OpenSketch.Commands.OPEN_SKETCH.id,
                        label: 'Open...'
                    });
                    toDisposeOnClose.push(Disposable.create(() => this.menuRegistry.unregisterMenuAction(OpenSketch.Commands.OPEN_SKETCH)));
                    for (const sketch of sketches) {
                        const command = { id: `arduino-open-sketch--${sketch.uri}` };
                        const handler = { execute: () => this.openSketch(sketch) };
                        toDisposeOnClose.push(registry.registerCommand(command, handler));
                        this.menuRegistry.registerMenuAction(ArduinoMenus.OPEN_SKETCH__CONTEXT__RECENT_GROUP, {
                            commandId: command.id,
                            label: sketch.name
                        });
                        toDisposeOnClose.push(Disposable.create(() => this.menuRegistry.unregisterMenuAction(command)));
                    }
                    const { parentElement } = target;
                    if (parentElement) {
                        const options = {
                            menuPath: ArduinoMenus.OPEN_SKETCH__CONTEXT,
                            anchor: {
                                x: parentElement.getBoundingClientRect().left,
                                y: parentElement.getBoundingClientRect().top + parentElement.offsetHeight
                            },
                            onHide: () => toDisposeOnClose.dispose()
                        }
                        this.contextMenuRenderer.render(options);
                    }
                }
            }
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerMenuAction(ArduinoMenus.FILE__SKETCH_GROUP, {
            commandId: OpenSketch.Commands.OPEN_SKETCH.id,
            label: 'Open...',
            order: '1'
        });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        registry.registerKeybinding({
            command: OpenSketch.Commands.OPEN_SKETCH.id,
            keybinding: 'CtrlCmd+O'
        });
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem({
            id: OpenSketch.Commands.OPEN_SKETCH__TOOLBAR.id,
            command: OpenSketch.Commands.OPEN_SKETCH__TOOLBAR.id,
            tooltip: 'Open',
            priority: 5
        });
    }

    async openSketch(toOpen: MaybePromise<Sketch | undefined> = this.selectSketch()): Promise<void> {
        const sketch = await toOpen;
        if (sketch) {
            this.workspaceService.open(new URI(sketch.uri));
        }
    }

    protected async selectSketch(): Promise<Sketch | undefined> {
        const config = await this.configService.getConfiguration();
        const defaultPath = await this.fileSystem.getFsPath(config.sketchDirUri);
        const { filePaths } = await remote.dialog.showOpenDialog({
            defaultPath,
            properties: ['createDirectory', 'openFile'],
            filters: [
                {
                    name: 'Sketch',
                    extensions: ['ino']
                }
            ]
        });
        if (!filePaths.length) {
            return undefined;
        }
        if (filePaths.length > 1) {
            this.logger.warn(`Multiple sketches were selected: ${filePaths}. Using the first one.`);
        }
        // TODO: validate sketch file name against the sketch folder. Move the file if required.
        const sketchFilePath = filePaths[0];
        const sketchFileUri = await this.fileSystemExt.getUri(sketchFilePath);
        return this.sketchService.getSketchFolder(sketchFileUri);
    }

}

export namespace OpenSketch {
    export namespace Commands {
        export const OPEN_SKETCH: Command = {
            id: 'arduino-open-sketch'
        };
        export const OPEN_SKETCH__TOOLBAR: Command = {
            id: 'arduino-open-sketch--toolbar'
        };
    }
}
