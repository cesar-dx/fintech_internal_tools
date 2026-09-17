import { User } from "@prisma/client";
import { switchActor } from "@/app/actions";

export function ActorBar({
  actor,
  actors,
}: {
  actor: User;
  actors: User[];
}) {
  return (
    <form action={switchActor} className="actor-bar">
      <span>
        Acting as <strong>{actor.name}</strong>{" "}
        <span className="badge">{actor.role}</span>
      </span>
      <span className="actor-switch">
        <label htmlFor="actorId">Switch user</label>
        <select
          id="actorId"
          name="actorId"
          key={actor.id}
          defaultValue={actor.id}
        >
          {actors.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name} — {candidate.role}
            </option>
          ))}
        </select>
        <button type="submit">Switch</button>
      </span>
    </form>
  );
}
