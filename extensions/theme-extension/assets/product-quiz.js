const api = new Gadget();

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
                nextQuestionId: true  // New field for linking to the next question.
              },
            },
          },
        },
      },
    },
  };

  try {
    const quizBySlug = await api.quiz.maybeFindFirst({
      filter: { slug: { equals: quizIdentifier } },
      select: selectionFields,
    });
    if (quizBySlug) return quizBySlug;
  } catch (error) {
    console.log("Error fetching quiz by slug, will try by ID:", error);
  }

  try {
    const quizById = await api.quiz.findOne(quizIdentifier, { select: selectionFields });
    return quizById;
  } catch (error) {
    console.log("Error fetching quiz by ID:", error);
    return null;
  }
};

const saveSelections = async (quizId, email, recommendedProducts) => {
  const productsQuery = recommendedProducts.map((rp) => ({
    create: {
      product: { _link: rp.recommendedProduct.productSuggestion.id },
      shop: { _link: window.shopId },
    },
  }));
  await api.quizResult.create({
    quiz: { _link: quizId },
    shop: { _link: window.shopId },
    email: email,
    shopperSuggestions: productsQuery,
  });
};

// Utility functions for smooth transitions.
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

let selectedAnswers = [];
let totalQuestions = 0;
let questionsArray = []; // Will hold quiz questions for reference.

const selectAnswer = (evt, answer, questionIndex) => {
  selectedAnswers.push(answer.id);
  const currentQuestionElem = document.getElementById("question_" + questionsArray[questionIndex].node.id);
  
  // Fade out the current question.
  if (currentQuestionElem) {
    fadeOut(currentQuestionElem, () => {
      // If the answer has a nextQuestionId, try to show that question.
      if (answer.nextQuestionId) {
        const nextQuestionElem = document.getElementById("question_" + answer.nextQuestionId);
        if (nextQuestionElem) {
          fadeIn(nextQuestionElem);
          return;
        }
      }
      // Fallback: show the next sequential question.
      if (questionIndex + 1 < totalQuestions) {
        const nextQuestionElem = document.getElementById("question_" + questionsArray[questionIndex + 1].node.id);
        if (nextQuestionElem) {
          fadeIn(nextQuestionElem);
          return;
        }
      }
      // End of quiz: reveal the email submission section.
      document.querySelector(".product-quiz__email-container").style.display = "block";
      document.querySelector(".product-quiz__submit").style.display = "block";
      document.querySelector(".product-quiz__submit-hr").style.display = "block";
    });
  }
};

document.addEventListener("DOMContentLoaded", function () {
  var quizSlug = window.quizSlug;

  fetchQuiz(quizSlug).then(async (quiz) => {
    const questions = quiz.questions.edges;
    totalQuestions = questions.length;
    questionsArray = questions;

    if (!customElements.get("product-quiz")) {
      customElements.define(
        "product-quiz",
        class ProductQuiz extends HTMLElement {
          constructor() {
            super();
            this.form = this.querySelector("form");
            this.heading = this.querySelector(".product-quiz__title");
            this.heading.innerHTML = quiz.title;
            this.body = this.querySelector(".product-quiz__body span");
            this.body.innerHTML = quiz.body;
            this.questions = this.querySelector(".product-quiz__questions");

            const emailContainer = this.querySelector(".product-quiz__email-container");
            const submitButton = this.querySelector(".product-quiz__submit");
            const submitHr = this.querySelector(".product-quiz__submit-hr");
            if (emailContainer) emailContainer.style.display = "none";
            if (submitButton) submitButton.style.display = "none";
            if (submitHr) submitHr.style.display = "none";

            const questionContainer = this.querySelector(".product-quiz__question");
            const answerContainer = this.querySelector(".product-quiz__question-answer");

            // Render each question.
            questions.forEach((question, i) => {
              const clonedDiv = questionContainer.cloneNode(true);
              clonedDiv.id = "question_" + question.node.id;
              if (i > 0) {
                clonedDiv.style.display = "none";
              }
              clonedDiv.insertAdjacentHTML(
                "beforeend",
                "<hr /><div><h3>" + question.node.text + "</h3></div><div class='product-quiz__answers_" + i + "'></div>"
              );
              this.questions.appendChild(clonedDiv);

              // Render answers for this question.
              const answers = question.node.answers.edges;
              answers.forEach((answer, j) => {
                const clonedSpan = answerContainer.cloneNode(true);
                clonedSpan.id = "answer_" + question.node.id + "_" + j;
                clonedSpan.insertAdjacentHTML(
                  "beforeend",
                  `<span><button class="button answer" id="${clonedSpan.id}">${answer.node.text}</button></span>`
                );
                clonedSpan.addEventListener("click", (evt) => {
                  selectAnswer(evt, answer.node, i);
                });
                this.querySelector(".product-quiz__answers_" + i).appendChild(clonedSpan);
              });
            });

            this.form.addEventListener("submit", async function (evt) {
              await onSubmitHandler(evt, quiz.id);
            });
          }
        }
      );
    }
  });
});