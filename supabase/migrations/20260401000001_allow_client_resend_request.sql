-- Allow clients to re-send a request that was previously rejected (e.g. after being removed by a coach).
-- The USING clause ensures the row currently has status='rejected' and belongs to the client.
-- The WITH CHECK clause ensures the client can only set status back to 'pending'.
CREATE POLICY "Clients can resend rejected requests" ON coach_client_requests
  FOR UPDATE
  USING (auth.uid() = client_id AND status = 'rejected')
  WITH CHECK (auth.uid() = client_id AND status = 'pending');
