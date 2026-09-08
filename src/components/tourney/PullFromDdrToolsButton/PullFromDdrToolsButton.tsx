import { useState } from "react";
import { IconButton } from "@chakra-ui/react";

import DialogForm from "../../ui/DialogForm";
import PullFromDdrToolsFormBody from "./PullFromDdrToolsFormBody";
import { toaster } from "../../ui/toaster";
import { useCurrentTourney } from "../../../context/CurrentTourneyContext";
import { fetchRoomState, parseRoomName } from "../../../lib/ddrTools";
import {
  buildPullPlan,
  isCommittable,
} from "../../../handlers/ddrtools/buildPullPlan";
import { handlePullRoundResults } from "../../../handlers/ddrtools/handlePullRoundResults";

import type { Round } from "../../../types/Round";
import type { PullPlan } from "../../../handlers/ddrtools/buildPullPlan";

interface Props {
  rounds: Round[] | null;
}

/**
 * Pulls a ddr.tools event room's results into this tournament: its drawn charts
 * become stages and its recorded scores become score rows, optionally ending
 * each round and advancing players.
 *
 * The dialog is a review step rather than a one-click import. Song names don't
 * agree perfectly between the two catalogs, so some charts need a human to
 * pick, and this writes into a live tournament.
 */
export default function PullFromDdrToolsButton({ rounds }: Props) {
  const { tourney } = useCurrentTourney();

  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PullPlan | null>(null);
  const [room, setRoom] = useState<string | null>(null);
  const [advance, setAdvance] = useState(false);

  function reset() {
    setLink("");
    setPlan(null);
    setRoom(null);
    setError(null);
    setAdvance(false);
  }

  async function handleLoad() {
    if (!tourney?.id) return;
    const parsedRoom = parseRoomName(link);
    if (!parsedRoom) {
      setError("Expected a ddr.tools event link or a room name");
      setPlan(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const state = await fetchRoomState(parsedRoom);
      setPlan(buildPullPlan(state, tourney.id, rounds ?? []));
      setRoom(parsedRoom);
    } catch (e) {
      setPlan(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (!tourney?.id || !plan) return false;
    const ready = plan.rounds.filter(isCommittable);
    if (!ready.length) {
      toaster.create({
        title: "Nothing to pull",
        description: "No match in that room is ready to commit.",
        type: "error",
      });
      return false;
    }

    setSubmitting(true);
    const done: string[] = [];
    try {
      // sequential so a failure part-way leaves earlier rounds committed and
      // named in the error, rather than an unknown subset
      for (const pulled of ready) {
        const result = await handlePullRoundResults(
          pulled,
          pulled.round!,
          tourney.id,
          tourney.type ?? null,
          { advance, sourceRoom: room ?? undefined },
        );
        done.push(
          `${result.roundName}: ${result.stagesCreated} chart(s), ${result.scoresRecorded} score(s)${result.advanced ? ", advanced" : ""}`,
        );
      }
      toaster.create({
        title: `Pulled ${done.length} match${done.length === 1 ? "" : "es"}`,
        description: done.join(" · "),
        type: "success",
        closable: true,
      });
      reset();
      return true;
    } catch (e) {
      toaster.create({
        title: "Pull failed",
        description: `${done.length ? `Committed ${done.join(" · ")}. ` : ""}${
          e instanceof Error ? e.message : String(e)
        }`,
        type: "error",
        closable: true,
      });
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogForm
      title="Pull results from ddr.tools"
      trigger={
        <IconButton
          colorPalette="teal"
          variant="outline"
          borderWidth={2}
          size="sm"
          px={2}
          loading={open && loading}
        >
          Pull from ddr.tools
        </IconButton>
      }
      formBody={
        <PullFromDdrToolsFormBody
          link={link}
          setLink={setLink}
          loading={loading}
          error={error}
          plan={plan}
          advance={advance}
          setAdvance={setAdvance}
          onLoad={handleLoad}
        />
      }
      showSubmit={!!plan?.rounds.some(isCommittable)}
      loading={submitting}
      open={open}
      setOpen={setOpen}
      onSubmit={handleSubmit}
      onCancel={reset}
    />
  );
}
