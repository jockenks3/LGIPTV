import { Btn, Modal } from "../navigation/SpatialNav";
import { Spinner } from "./ui";
import { setState, useStore } from "../store/appStore";
import { fmtNum } from "../utils/format";

export function BusyOverlay() {
  const busy = useStore((s) => s.busy);
  if (!busy) return null;
  const close = () => setState({ busy: null });
  if (busy.error) {
    return (
      <Modal onClose={close} className="modal-sm">
        <div className="modal-title">{busy.title} failed</div>
        <div className="modal-text">{busy.error}</div>
        <div className="modal-actions">
          <Btn className="btn btn-primary" autoFocus onClick={close}>
            Close
          </Btn>
        </div>
      </Modal>
    );
  }
  return (
    <Modal onClose={function () {}} className="modal-sm">
      <div className="modal-title">{busy.title}</div>
      <div className="busy-row">
        <Spinner />
        <div className="busy-text">
          <div>{busy.stage}</div>
          {busy.count > 0 && <div className="busy-count">{fmtNum(busy.count)} entries</div>}
        </div>
      </div>
      <div className="modal-text">Large playlists are processed in the background. Please keep the app open.</div>
    </Modal>
  );
}
