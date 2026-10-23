import { MOVEMENT_KINDS, type MovementType } from "./movementKinds";

/** Passo 1 do "Registar movimento": os cartões de tipo do protótipo (`typecards`). */
export function MovementTypeCards({ onChoose }: { onChoose: (type: MovementType) => void }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2.5">
      {MOVEMENT_KINDS.map((kind) => {
        const Icon = kind.icon;
        return (
          <button
            key={kind.id}
            type="button"
            onClick={() => onChoose(kind.id)}
            className="flex min-h-[110px] flex-col gap-1.5 rounded-xl border bg-card p-3.5 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {kind.name}
            </span>
            <span className="text-[12.5px] text-muted-foreground">{kind.description}</span>
          </button>
        );
      })}
    </div>
  );
}
