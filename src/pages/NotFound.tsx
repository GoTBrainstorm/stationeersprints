import Link from '../components/Link'

export default function NotFound({ message }: { message?: string }) {
  return (
    <div className="fatal">
      <h1>Not found</h1>
      <p>{message ?? 'There is nothing at this address.'}</p>
      <p>
        <Link to="/">Back to the editor</Link>
      </p>
    </div>
  )
}
