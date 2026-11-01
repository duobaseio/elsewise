#!/usr/bin/env perl
# Sessions and the channels they are attached to.

package Daemon::Sessions;

use strict;
use warnings;
use Daemon::Channel;

our $VERSION = '1.02';

use constant MAX_PENDING => 0x40;
use constant { IDLE => 0, ATTACHED => 1, CLOSED => 2 };

sub new {
	my $class = shift;
	my %args = @_;
	my $self = { id => $args{id}, retries => $args{retries} // 3, pending => [], state => IDLE };
	return bless $self, $class;
}

sub subscribe {
	my ($self, $channel) = @_;
	my @batch = splice @{ $self->{pending} }, 0, MAX_PENDING;
	$self->{state} = $channel->open ? ATTACHED : CLOSED;
	return wantarray ? @batch : scalar map { $channel->send($_) } @batch;
}

=head2 attach($sessions, $log, @ids)

Attach every session in @ids to one channel, skipping ids that are not known.

=cut

sub attach {
	my ($sessions, $log, @ids) = @_;

	my $channel = Daemon::Channel->new(capacity => MAX_PENDING);

	SESSION: foreach my $id (@ids) {
		next SESSION unless $id =~ /^sess_ (?<hex>[0-9a-f]{8}) $/xi;
		(my $label = $id) =~ s/^sess_/session #/;

		my $session = $sessions->{$id} // die { NotFound => $id };
		my $flushed = eval { $session->subscribe($channel) };

		if (my $error = $@) {
			$log->warn(sprintf "%s failed after %d retries: %s", $label, $session->{retries}, $error);
			next SESSION if ref $error eq 'HASH' && exists $error->{NotFound};
		}

		$log->debug(<<~"END") for 1 .. (($flushed // 0) > 0 ? 1 : 0);
			$label flushed $flushed of ${\ MAX_PENDING}\t$session->{retries} retries left
			END
	}

	return $channel->open ? $channel : undef;
}
