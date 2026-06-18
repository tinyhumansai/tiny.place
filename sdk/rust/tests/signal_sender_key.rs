//! Sender Key (group messaging) tests: a sender's distribution bootstraps a
//! receiver, who then verifies + decrypts messages, including out of order.

use tinyplace::signal::sender_key::{GroupSenderKey, GroupSenderKeyReceiver, SenderKeyMessage};

#[test]
fn receiver_decrypts_in_order() {
    let mut sender = GroupSenderKey::create();
    let mut receiver = GroupSenderKeyReceiver::from_distribution(&sender.distribution()).unwrap();

    for text in [b"one".as_slice(), b"two", b"three"] {
        let msg = sender.encrypt(text);
        assert_eq!(receiver.decrypt(&msg).unwrap(), text);
    }
}

#[test]
fn receiver_handles_out_of_order() {
    let mut sender = GroupSenderKey::create();
    let mut receiver = GroupSenderKeyReceiver::from_distribution(&sender.distribution()).unwrap();

    let m0 = sender.encrypt(b"zero");
    let m1 = sender.encrypt(b"one");
    let m2 = sender.encrypt(b"two");

    // Deliver 2, then 0, then 1.
    assert_eq!(receiver.decrypt(&m2).unwrap(), b"two");
    assert_eq!(receiver.decrypt(&m0).unwrap(), b"zero");
    assert_eq!(receiver.decrypt(&m1).unwrap(), b"one");
}

#[test]
fn distribution_lets_a_late_joiner_read_forward_only() {
    let mut sender = GroupSenderKey::create();
    let _early = sender.encrypt(b"before joining");
    // Distribution snapshot taken AFTER the first message.
    let mut receiver = GroupSenderKeyReceiver::from_distribution(&sender.distribution()).unwrap();

    let later = sender.encrypt(b"after joining");
    assert_eq!(receiver.decrypt(&later).unwrap(), b"after joining");

    // The pre-join message is older than the receiver's chain — unreadable.
    assert!(receiver.decrypt(&_early).is_err());
}

#[test]
fn rejects_forged_signature() {
    let sender = GroupSenderKey::create();
    let receiver_dist = sender.distribution();
    let mut receiver = GroupSenderKeyReceiver::from_distribution(&receiver_dist).unwrap();

    // A different sender's signature over the same iteration must not verify.
    let mut attacker = GroupSenderKey::restore(&{
        let mut state = sender.serialize();
        // Keep the chain, swap the signing key by creating a fresh own state.
        let fresh = GroupSenderKey::create().serialize();
        state.signature_private_key = fresh.signature_private_key;
        state.signature_public_key = fresh.signature_public_key;
        state
    })
    .unwrap();
    let forged: SenderKeyMessage = attacker.encrypt(b"forged");
    assert!(receiver.decrypt(&forged).is_err());
}

#[test]
fn forged_iteration_does_not_advance_receiver_state() {
    let mut sender = GroupSenderKey::create();
    let mut receiver = GroupSenderKeyReceiver::from_distribution(&sender.distribution()).unwrap();

    // A real message whose iteration metadata is tampered to a far-future value.
    // The signature only covers the ciphertext, so it still verifies, but the
    // message key derived at the bogus iteration fails the AEAD MAC.
    let real = sender.encrypt(b"hello");
    let forged = SenderKeyMessage {
        iteration: real.iteration + 500,
        ciphertext: real.ciphertext.clone(),
        signature: real.signature.clone(),
    };
    assert!(receiver.decrypt(&forged).is_err());

    // The failed decrypt must not have ratcheted the chain: the genuine message
    // at its real iteration still decrypts.
    assert_eq!(receiver.decrypt(&real).unwrap(), b"hello");
}

#[test]
fn serialize_round_trips() {
    let mut sender = GroupSenderKey::create();
    let _ = sender.encrypt(b"advance");
    let restored = GroupSenderKey::restore(&sender.serialize()).unwrap();
    assert_eq!(restored.current_iteration(), sender.current_iteration());

    let mut receiver = GroupSenderKeyReceiver::from_distribution(&sender.distribution()).unwrap();
    let msg = sender.encrypt(b"hi");
    let mut restored_receiver = GroupSenderKeyReceiver::restore(&receiver.serialize()).unwrap();
    assert_eq!(restored_receiver.decrypt(&msg).unwrap(), b"hi");
    // original receiver still works too
    assert_eq!(receiver.decrypt(&msg).unwrap(), b"hi");
}
