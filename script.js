const FORMSPREE_ENDPOINT = "https://formspree.io/f/xdajllab";
const STORAGE_KEY = "moveburgh-signup";

const form = document.getElementById("signup-form");
const card = form.closest(".signup__card");
const emailInput = document.getElementById("email");
const submitButton = document.getElementById("submit-button");
const formMessage = document.getElementById("form-message");
const successMessage = document.getElementById("success-message");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const defaultButtonLabel = submitButton.textContent;

const showSuccess = () => {
  card.classList.add("is-success");
  formMessage.textContent = "";
  successMessage.hidden = false;
};

const restoreSuccess = () => {
  if (sessionStorage.getItem(STORAGE_KEY)) {
    showSuccess();
  }
};

const setSubmitting = (isSubmitting) => {
  submitButton.disabled = isSubmitting;
  submitButton.textContent = isSubmitting ? "Sending…" : defaultButtonLabel;
};

const validateEmail = (value) => emailPattern.test(value.trim());

const submitToFormspree = async (email) => {
  const body = new FormData(form);
  body.set("email", email);
  body.set("_subject", "New moveburgh signup");

  const response = await fetch(FORMSPREE_ENDPOINT, {
    method: "POST",
    body,
    headers: { Accept: "application/json" },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof data.error === "string"
        ? data.error
        : "Something went wrong. Please try again.";
    throw new Error(message);
  }

  return data;
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formMessage.textContent = "";

  const email = emailInput.value.trim();

  if (!email) {
    formMessage.textContent = "Please enter your email address.";
    emailInput.focus();
    return;
  }

  if (!validateEmail(email)) {
    formMessage.textContent = "Please enter a valid email address.";
    emailInput.focus();
    return;
  }

  setSubmitting(true);

  try {
    await submitToFormspree(email);
    sessionStorage.setItem(STORAGE_KEY, email);
    showSuccess();
  } catch (error) {
    formMessage.textContent =
      error instanceof Error
        ? error.message
        : "Something went wrong. Please try again.";
  } finally {
    setSubmitting(false);
  }
});

restoreSuccess();
