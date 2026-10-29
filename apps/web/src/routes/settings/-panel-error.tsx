export function PanelError({ error }: { error: unknown }) {
  return (
    <div className="flex max-w-3xl flex-col gap-8 p-8">
      <h1 className="text-heading-lg">Could not show these settings</h1>
      <p className="text-sm text-text-2">{error instanceof Error ? error.message : String(error)}</p>
    </div>
  );
}
