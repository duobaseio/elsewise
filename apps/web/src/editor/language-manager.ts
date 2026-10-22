import type { LanguageDescription } from '@codemirror/language';
import { languages as DEFAULT_LANGUAGES } from '@codemirror/language-data';
import type { Disposable, EditorLanguages, LanguageServer } from '@elsewise/plugin';

/**
 * The languages and their language servers as plugins see them.
 */
export class LanguageManager implements EditorLanguages {
  private addedLanguages: readonly (readonly LanguageDescription[])[] = [DEFAULT_LANGUAGES];
  private currentLanguages: readonly LanguageDescription[] = DEFAULT_LANGUAGES;
  private addedServers: readonly (readonly LanguageServer[])[] = [];
  private currentServers: readonly LanguageServer[] = [];

  constructor(private readonly notify: () => void) {}

  /**
   * The languages, sorted by most recently added, then the built-in ones.
   */
  get languages(): readonly LanguageDescription[] {
    return this.currentLanguages;
  }

  add(languages: readonly LanguageDescription[]): Disposable {
    const added = [...languages];
    this.addedLanguages = [added, ...this.addedLanguages];
    this.currentLanguages = this.addedLanguages.flat();
    this.notify();
    return () => {
      this.addedLanguages = this.addedLanguages.filter((other) => other !== added);
      this.currentLanguages = this.addedLanguages.flat();
      this.notify();
    };
  }

  /**
   * The language servers, sorted by most recently added.
   */
  get servers(): readonly LanguageServer[] {
    return this.currentServers;
  }

  addServers(servers: readonly LanguageServer[]): Disposable {
    const added = [...servers];
    this.addedServers = [added, ...this.addedServers];
    this.currentServers = this.addedServers.flat();
    this.notify();
    return () => {
      this.addedServers = this.addedServers.filter((other) => other !== added);
      this.currentServers = this.addedServers.flat();
      this.notify();
    };
  }
}
