import { inject, injectable } from '@theia/core/shared/inversify';
import { DisposableCollection, nls } from '@theia/core/lib/common';
import { BoardUserField } from '../../common/protocol';
import { BoardsServiceProvider } from '../boards/boards-service-provider';
import { UserFieldsDialog } from '../dialogs/user-fields/user-fields-dialog';
import { ArduinoMenus, PlaceholderMenuNode } from '../menu/arduino-menus';
import { MenuModelRegistry, Contribution } from './contribution';
import { UploadSketch } from './upload-sketch';

@injectable()
export class UserFields extends Contribution {
  private boardRequiresUserFields = false;
  private userFieldsSet = false;
  private readonly cachedUserFields: Map<string, BoardUserField[]> = new Map();
  private readonly menuActionsDisposables = new DisposableCollection();

  @inject(UserFieldsDialog)
  private readonly userFieldsDialog: UserFieldsDialog;

  @inject(BoardsServiceProvider)
  protected readonly boardsServiceProvider: BoardsServiceProvider;

  @inject(MenuModelRegistry)
  private readonly menuRegistry: MenuModelRegistry;

  protected override init(): void {
    super.init();
    this.boardsServiceProvider.onBoardsConfigChanged(async () => {
      const userFields =
        await this.boardsServiceProvider.selectedBoardUserFields();
      this.boardRequiresUserFields = userFields.length > 0;
      this.registerMenus(this.menuRegistry);
    });
  }

  override registerMenus(registry: MenuModelRegistry): void {
    this.menuActionsDisposables.dispose();
    if (this.boardRequiresUserFields) {
      this.menuActionsDisposables.push(
        registry.registerMenuAction(ArduinoMenus.SKETCH__MAIN_GROUP, {
          commandId: UploadSketch.Commands.UPLOAD_WITH_CONFIGURATION.id,
          label: UploadSketch.Commands.UPLOAD_WITH_CONFIGURATION.label,
          order: '2',
        })
      );
    } else {
      this.menuActionsDisposables.push(
        registry.registerMenuNode(
          ArduinoMenus.SKETCH__MAIN_GROUP,
          new PlaceholderMenuNode(
            ArduinoMenus.SKETCH__MAIN_GROUP,
            // commandId: UploadSketch.Commands.UPLOAD_WITH_CONFIGURATION.id,
            UploadSketch.Commands.UPLOAD_WITH_CONFIGURATION.label,
            { order: '2' }
          )
        )
      );
    }
  }

  private selectedFqbnAddress(): string {
    const { boardsConfig } = this.boardsServiceProvider;
    const fqbn = boardsConfig.selectedBoard?.fqbn;
    if (!fqbn) {
      return '';
    }
    const address =
      boardsConfig.selectedBoard?.port?.address ||
      boardsConfig.selectedPort?.address;
    if (!address) {
      return '';
    }
    return fqbn + '|' + address;
  }

  private async showUserFieldsDialog(
    key: string
  ): Promise<BoardUserField[] | undefined> {
    const cached = this.cachedUserFields.get(key);
    // Deep clone the array of board fields to avoid editing the cached ones
    this.userFieldsDialog.value = (
      cached ?? (await this.boardsServiceProvider.selectedBoardUserFields())
    ).map((f) => ({ ...f }));
    const result = await this.userFieldsDialog.open();
    if (!result) {
      return;
    }

    this.userFieldsSet = true;
    this.cachedUserFields.set(key, result);
    return result;
  }

  async checkUserFieldsDialog(forceOpen: boolean): Promise<boolean> {
    const key = this.selectedFqbnAddress();
    if (!key) {
      return false;
    }
    /*
      If the board requires to be configured with user fields, we want
      to show the user fields dialog, but only if they weren't already
      filled in or if they were filled in, but the previous upload failed.
    */
    if (
      !forceOpen &&
      (!this.boardRequiresUserFields ||
        (this.cachedUserFields.has(key) && this.userFieldsSet))
    ) {
      return true;
    }
    const userFieldsFilledIn = Boolean(await this.showUserFieldsDialog(key));
    return userFieldsFilledIn;
  }

  checkUserFieldsForUpload(): boolean {
    // TODO: This does not belong here.
    // IDE2 should not do any preliminary checks but let the CLI fail and then toast a user consumable error message.
    if (!this.boardRequiresUserFields || this.getUserFields().length > 0) {
      this.userFieldsSet = true;
      return true;
    }
    this.messageService.error(
      nls.localize(
        'arduino/sketch/userFieldsNotFoundError',
        "Can't find user fields for connected board"
      )
    );
    this.userFieldsSet = false;
    return false;
  }

  getUserFields(): BoardUserField[] {
    return this.cachedUserFields.get(this.selectedFqbnAddress()) ?? [];
  }

  isRequired(): boolean {
    return this.boardRequiresUserFields;
  }

  notifyFailedWithError(e: Error): void {
    if (
      this.boardRequiresUserFields &&
      typeof e.message === 'string' &&
      e.message.startsWith('Upload error:')
    ) {
      this.userFieldsSet = false;
    }
  }
}
