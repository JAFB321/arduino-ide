
import { injectable, inject } from 'inversify';
import { CommandService } from '@theia/core/lib/common/command';
import { ApplicationShell, Widget } from '@theia/core/lib/browser';
import { EditorMode } from '../editor-mode';
import { EditorWidget } from '@theia/editor/lib/browser';
import { SaveAsSketch } from '../contributions/save-as-sketch';

@injectable()
export class ArduinoApplicationShell extends ApplicationShell {

    @inject(EditorMode)
    protected readonly editorMode: EditorMode;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    protected async track(widget: Widget): Promise<void> {
        if (this.editorMode.proMode) {
            super.track(widget);
        } else {
            if (widget instanceof EditorWidget && widget.editor.uri.toString().endsWith('arduino-cli.yaml')) {
                return;
            }
            widget.title.closable = false;
        }
    }

    async save(): Promise<void> {
        await super.save();
        await this.commandService.executeCommand(SaveAsSketch.Commands.SAVE_AS_SKETCH.id, { execOnlyIfTemp: true, openAfterMove: true });
    }

}
