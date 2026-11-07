import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { Ban, ClipboardCheck, Database, Eye, Fingerprint, MapPin, Phone, ShieldCheck, Smartphone } from 'lucide-react';
import { useConfig } from '../../lib/store';

const HELPLINES: [string, string, string][] = [
  ['GBA / city corporations civic helpline (“Sahaaya”)', '1533', 'Roads, garbage, streetlights, drains, trees'],
  ['BWSSB – water supply & sewage', '1916', 'No water, leaks, sewage overflow, manholes'],
  ['BESCOM – electricity', '1912', 'Power cuts, dangling wires, transformer issues'],
  ['Emergency – police, fire, ambulance', '112', 'Any danger to life'],
  ['Fire & emergency services', '101', ''],
  ['Ambulance', '108', ''],
  ['Cyber crime helpline', '1930', 'Online fraud / impersonation'],
];

export default function About() {
  const { config } = useConfig();
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);
  const s = config?.settings;

  return (
    <div className="page-narrow prose">
      <div className="page-head">
        <h1>About Nimma Bengaluru</h1>
      </div>

      <section className="card" id="about">
        <h2>What this is</h2>
        <p>
          Nimma Bengaluru (“your Bengaluru”) is a citizen-driven civic issue reporting and official response platform. Residents report potholes, garbage black spots, broken streetlights,
          waterlogging, open manholes and other problems with a live photo and GPS location. Each report is tagged with the ward it falls in – using the official 2025 ward map of the five Greater
          Bengaluru Authority (GBA) city corporations ({config?.wardCount || 369} wards) – and the administrator reviews it, assigns it to the right department, and closes it with evidence.
        </p>
        <div className="alert alert-info small">
          This is an academic prototype. It is <strong>not</strong> an official Government of Karnataka or GBA service and does not automatically forward complaints
          to any authority. For official complaints use Sahaaya (1533) or the Janaspandana portal.
        </div>
      </section>

      <section className="card" id="misuse">
        <h2>
          <ShieldCheck size={20} /> How suspicious reports are reviewed
        </h2>
        <ul className="feature-list">
          <li>
            <Smartphone size={18} />
            <span>
              <strong>Self-reported contact number.</strong> The number is not verified. Officials may use it for follow-up, but it does not establish a person's identity.
            </span>
          </li>
          <li>
            <MapPin size={18} />
            <span>
              <strong>Live GPS at the spot.</strong> The reporter must be within {s?.maxPinDistanceM || 500} m of the issue. Location outside Bengaluru is refused.
            </span>
          </li>
          <li>
            <Eye size={18} />
            <span>
              <strong>Live camera only.</strong> Photos are captured inside the app and stamped with GPS and time; gallery or downloaded images are refused. Re-used photos are detected by
              their fingerprint (hash).
            </span>
          </li>
          <li>
            <Fingerprint size={18} />
            <span>
              <strong>Device & network signals.</strong> The system stores a device identifier, browser details and IP address. Repeated use across numbers can be flagged for review; shared devices and networks can produce misleading matches.
            </span>
          </li>
          <li>
            <Ban size={18} />
            <span>
              <strong>Rate limits and review.</strong> At most {s ? `${s.maxReportsPerHour} reports per hour and ${s.maxReportsPerDay} per day` : 'a few reports per day'} per contact number and device. Officials review suspicious reports and record a reason before applying restrictions. A risk flag alone is not proof of misuse.
            </span>
          </li>
          <li>
            <ClipboardCheck size={18} />
            <span>
              <strong>Human review and evidence handling.</strong> Authorised reviewers can examine recorded report details and preserve an audit trail. Device, network and location signals may be inaccurate or shared; they do not prove identity, intent or guilt. Any referral to a competent authority is a human decision under that institution’s process.
            </span>
          </li>
        </ul>
      </section>

      <section className="card" id="privacy">
        <h2>
          <Database size={20} /> Privacy notice
        </h2>
        <p>This academic prototype collects the following information for report follow-up and misuse review. This is not a production privacy-compliance statement:</p>
        <table className="table table-stack">
          <thead>
            <tr>
              <th>Data</th>
              <th>Why</th>
              <th>Who sees it</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td data-label="Data">Name, mobile number, residential locality</td>
              <td data-label="Why">Follow-up and accountability</td>
              <td data-label="Who sees it">Only the administrator (the number is masked; revealing it is logged)</td>
            </tr>
            <tr>
              <td data-label="Data">Issue photos / video, description, issue location</td>
              <td data-label="Why">To act on the issue</td>
              <td data-label="Who sees it">The administrator. Citizen reports are not shown on a public map.</td>
            </tr>
            <tr>
              <td data-label="Data">Live GPS position, device ID, browser fingerprint, IP address, timestamps</td>
              <td data-label="Why">To prevent fake reports and to investigate misuse</td>
              <td data-label="Who sees it">The administrator, only for misuse checks. Every access is recorded in an audit log.</td>
            </tr>
          </tbody>
        </table>
        <p className="small muted">
          Sensitive allegations are disabled by default. Before enabling them, an institution must approve the reviewer roles, evidence handling, retention and referral process. Retention limits and a data-handling policy must also be established before any real deployment.
        </p>
      </section>

      <section className="card" id="helplines">
        <h2>
          <Phone size={20} /> Helpline numbers
        </h2>
        <table className="table">
          <tbody>
            {HELPLINES.map(([name, num, note]) => (
              <tr key={num}>
                <td>
                  {name}
                  {note && <div className="small muted">{note}</div>}
                </td>
                <td>
                  <a href={`tel:${num}`} className="helpline-num">
                    {num}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card" id="data">
        <h2>Data sources</h2>
        <ul className="small">
          <li>Ward boundaries: GBA Wards Delimitation 2025 – 369 wards, 5 city corporations (Greater Bengaluru Authority, via OpenCity data.opencity.in, public domain).</li>
          <li>Issue categories based on BBMP grievance data for 2025 (streetlights ~31%, solid waste ~30% of complaints) and recurring city issues.</li>
          <li>Maps: © OpenStreetMap contributors.</li>
        </ul>
      </section>
    </div>
  );
}
