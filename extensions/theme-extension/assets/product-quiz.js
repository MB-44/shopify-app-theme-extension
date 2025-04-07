const api = new Gadget();

/**
 * Fetch recommended products from Gadget.dev based on selected answer IDs
 */
const fetchRecommendedProducts = async (answerIds) => {
  const queryIdFilter = answerIds.map((answerId) => ({ id: { equals: answerId } }));
  const recommendedProducts = await api.answer.findMany({
    filter: { OR: queryIdFilter },
    select: {
      recommendedProduct: {
        id: true,
        productSuggestion: {
          id: true,
          title: true,
          body: true,
          handle: true,
          media: {
            edges: { node: { image: true } },
          },
        },
      },
    },
  });
  return recommendedProducts;
};

/**
 * Fetch quiz by ID or slug
 */
const fetchQuiz = async (quizIdentifier) => {
  const selectionFields = {
    id: true,
    title: true,
    body: true,
    questions: {
      edges: {
        node: {
          id: true,
          text: true,
          answers: {
            edges: {
              node: {
                id: true,
                text: true,
                nextQuestionId: true
              },
            },
          },
        },
      },
    },
  };

  // First, try using quizIdentifier as an ID
  try {
    const quizById = await api.quiz.findOne(quizIdentifier, { select: selectionFields });
    if (quizById) {
      return quizById;
    }
  } catch (error) {
    console.log("Error fetching quiz by ID:", error);
  }

  // Fallback: try slug
  try {
    const quizBySlug = await api.quiz.maybeFindFirst({
      filter: { slug: { equals: quizIdentifier } },
      select: selectionFields,
    });
    if (quizBySlug) {
      return quizBySlug;
    }
  } catch (error) {
    console.log("Error fetching quiz by slug:", error);
  }

  return null;
};

// Simple fade-out and fade-in transitions
const fadeOut = (element, callback) => {
  element.style.transition = "opacity 0.5s";
  element.style.opacity = 0;
  setTimeout(() => {
    element.style.display = "none";
    if (callback) callback();
  }, 500);
};

const fadeIn = (element) => {
  element.style.display = "block";
  element.style.opacity = 0;
  setTimeout(() => {
    element.style.transition = "opacity 0.5s";
    element.style.opacity = 1;
  }, 50);
};

// Global quiz state
let selectedAnswers = [];
let totalQuestions = 0;
let questionsArray = [];

/**
 * Display recommended products at the end of the quiz
 */
const showRecommendedProducts = async () => {
  const recommendedProducts = await fetchRecommendedProducts(selectedAnswers);

  // Build HTML for recommended products
  let recommendedProductHTML = `
    <div>
      <h2>Based on your selections, we recommend the following products:</h2>
      <div style="display: flex; overflow: auto;">
  `;

  recommendedProducts.forEach((result) => {
    const { recommendedProduct } = result;
    const imgUrl =
      recommendedProduct.productSuggestion.media?.edges?.[0]?.node?.image?.originalSrc;
    const productLink = recommendedProduct.productSuggestion.handle;

    recommendedProductHTML += `
      <div style="padding: 8px 16px; margin: 10px; border: 1px solid black; display: flex; flex-direction: column; align-items: center;">
        <h3>${recommendedProduct.productSuggestion.title}</h3>
        <a class="button" href="/products/${productLink}">Check it out</a>
        <img src="${imgUrl}" width="200px" style="margin-top: 8px;" />
      </div>
    `;
  });

  recommendedProductHTML += `</div></div>`;

  // Replace quiz questions with the recommended products
  const questionsContainer = document.getElementById("questions");
  if (questionsContainer) {
    questionsContainer.innerHTML = recommendedProductHTML;
  }
};

/**
 * Handle selecting an answer
 */
const selectAnswer = (evt, answer, questionIndex) => {
  selectedAnswers.push(answer.id);

  const currentQuestionElem = document.getElementById(
    "question_" + questionsArray[questionIndex].node.id
  );

  // Fade out current question
  if (currentQuestionElem) {
    fadeOut(currentQuestionElem, () => {
      // If the answer has a nextQuestionId, show that question
      if (answer.nextQuestionId) {
        const nextQuestionElem = document.getElementById("question_" + answer.nextQuestionId);
        if (nextQuestionElem) {
          fadeIn(nextQuestionElem);
          return;
        }
      }

      // Fallback: show next sequential question
      if (questionIndex + 1 < totalQuestions) {
        const nextQuestionElem = document.getElementById(
          "question_" + questionsArray[questionIndex + 1].node.id
        );
        if (nextQuestionElem) {
          fadeIn(nextQuestionElem);
          return;
        }
      }

      // No more questions: directly show recommended products
      showRecommendedProducts();
    });
  }
};

/**
 * Initialize the quiz on DOM load
 */
document.addEventListener("DOMContentLoaded", async function () {
  const quizSlug = window.quizSlug;
  const quiz = await fetchQuiz(quizSlug);
  if (!quiz) {
    console.log("No quiz found with identifier:", quizSlug);
    return;
  }

  const questions = quiz.questions.edges;
  totalQuestions = questions.length;
  questionsArray = questions;

  // Define a custom element only once
  if (!customElements.get("product-quiz")) {
    customElements.define(
      "product-quiz",
      class ProductQuiz extends HTMLElement {
        constructor() {
          super();
          this.heading = this.querySelector(".product-quiz__title");
          this.heading.innerHTML = quiz.title;

          this.body = this.querySelector(".product-quiz__body span");
          this.body.innerHTML = quiz.body;

          this.questionsContainer = this.querySelector(".product-quiz__questions");

          const questionTemplate = this.querySelector(".product-quiz__question");
          const answerTemplate = this.querySelector(".product-quiz__question-answer");

          // Hide or remove the email container & submit button
          const emailContainer = this.querySelector(".product-quiz__email-container");
          const submitButton = this.querySelector(".product-quiz__submit");
          const submitHr = this.querySelector(".product-quiz__submit-hr");
          if (emailContainer) emailContainer.remove();
          if (submitButton) submitButton.remove();
          if (submitHr) submitHr.remove();

          // Render each question
          questions.forEach((question, i) => {
            const clonedDiv = questionTemplate.cloneNode(true);
            clonedDiv.id = "question_" + question.node.id;
            if (i > 0) {
              clonedDiv.style.display = "none";
            }
            clonedDiv.insertAdjacentHTML(
              "beforeend",
              `<hr /><div><h3>${question.node.text}</h3></div>
               <div class="product-quiz__answers_${i}"></div>`
            );
            this.questionsContainer.appendChild(clonedDiv);

            // Render answers for this question
            const answers = question.node.answers.edges;
            answers.forEach((answerData, j) => {
              const clonedSpan = answerTemplate.cloneNode(true);
              clonedSpan.id = `answer_${question.node.id}_${j}`;
              clonedSpan.insertAdjacentHTML(
                "beforeend",
                `<span>
                  <button class="button answer" id="${clonedSpan.id}">
                    ${answerData.node.text}
                  </button>
                 </span>`
              );
              clonedSpan.addEventListener("click", (evt) => {
                selectAnswer(evt, answerData.node, i);
              });
              this.querySelector(`.product-quiz__answers_${i}`).appendChild(clonedSpan);
            });
          });
        }
      }
    );
  }
});