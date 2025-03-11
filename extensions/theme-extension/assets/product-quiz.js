const api = new Gadget();

const fetchRecommendedProducts = async (answerIds) => {
  const queryIdFilter = answerIds.map((answerId) => {
    return { id: { equals: answerId } };
  });

  const recommendedProducts = await api.answer.findMany({
    filter: {
      OR: queryIdFilter,
    },
    select: {
      recommendedProduct: {
        id: true,
        productSuggestion: {
          id: true,
          title: true,
          body: true,
          handle: true,
          images: {
            edges: {
              node: {
                source: true,
              },
            },
          },
        },
      },
    },
  });

  return recommendedProducts;
};

const fetchQuiz = async (quizSlug) => {
  const quiz = await api.quiz.findFirst({
    filter: {
      slug: { equals: quizSlug },
    },
    select: {
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
                },
              },
            },
          },
        },
      },
    },
  });

  return quiz;
};

const saveSelections = async (quizId, email, recommendedProducts) => {
  const productsQuery = recommendedProducts.map((rp) => {
    return {
      create: {
        product: {
          _link: rp.recommendedProduct.productSuggestion.id,
        },
      },
    };
  });
  await api.quizResult.create({
    quiz: {
      _link: quizId,
    },
    email: email,
    shopperSuggestions: [...productsQuery],
  });
};

const onSubmitHandler = async (evt, quizId) => {
  evt.preventDefault();

  const email = document.getElementById("product-quiz__email").value;

  const submitButton = document.querySelector(".product-quiz__submit");
  submitButton.classList.add("disabled");

  const recommendedProducts = await fetchRecommendedProducts(selectedAnswers);

  await saveSelections(quizId, email, recommendedProducts);

  let recommendedProductHTML =
    "<div><h2>Based on your selections, we recommend the following products</h2><div style='display: flex; overflow: auto'>";

  recommendedProducts.forEach((result) => {
    const { recommendedProduct } = result;
    const imgUrl =
      recommendedProduct.productSuggestion.images?.edges?.[0]?.node?.source;
    const productLink = recommendedProduct.productSuggestion.handle;
    recommendedProductHTML +=
      `<span style="padding: 8px 16px; margin-left: 10px; border: black 1px solid; align-items: center; display: flex; flex-direction: column"><h3>${recommendedProduct.productSuggestion.title}</h3><a class="button" href="/products/${productLink}">Check it out</a>` +
      `<br/><img src=${imgUrl} width="200px" /><br /></span>`;
  });

  recommendedProductHTML += "</div></div>";
  document.getElementById("questions").innerHTML = recommendedProductHTML;

  submitButton.classList.add("hidden");
  document.querySelector(".product-quiz__submit-hr").classList.add("hidden");
  document
    .querySelector(".product-quiz__email-container")
    .classList.add("hidden");
};

let selectedAnswers = [];

const selectAnswer = (evt, answerId, answerText) => {
  selectedAnswers.push(answerId);
  let elId = evt.srcElement.id;
  let parent = document.getElementById(elId).parentNode;
  parent.innerHTML = "<h3><b>" + decodeURI(answerText) + "</b> selected</h3>";

  const productQuiz = evt.target.closest("product-quiz");
  if (productQuiz && typeof productQuiz.slideToNextQuestion === "function") {
    productQuiz.slideToNextQuestion();
  }
};

document.addEventListener("DOMContentLoaded", function () {
  var quizSlug = window.quizSlug;

  fetchQuiz(quizSlug).then(async (quiz) => {
    const questions = quiz.questions.edges;

    if (!customElements.get("product-quiz")) {
      customElements.define(
        "product-quiz",
        class ProductQuiz extends HTMLElement {
          constructor() {
            super();

            this.styleSettings = {};
            try {
              this.styleSettings = JSON.parse(
                this.getAttribute("data-styles") || "{}"
              );
            } catch (err) {
              console.error("Error parsing style settings:", err);
            }

            this.form = this.querySelector("form");
            this.heading = this.querySelector(".product-quiz__title");
            this.heading.innerHTML = quiz.title;
            this.body = this.querySelector(".product-quiz__body span");
            this.body.innerHTML = quiz.body;
            this.questionsContainer = this.querySelector(".product-quiz__questions");

            this.currentQuestionIndex = 0;

            const questionContainerTemplate = this.querySelector(
              ".product-quiz__question"
            );
            const answerContainerTemplate = this.querySelector(
              ".product-quiz__question-answer"
            );

            this.questionsContainer.innerHTML = "";

            questions.forEach((question, i) => {
              const questionDiv = questionContainerTemplate.cloneNode(true);
              questionDiv.id = "question_" + i;
              questionDiv.innerHTML =
                "<hr /><div><h3>" +
                question.node.text +
                `</h3></div><div class='product-quiz__answers_${i}'></div>`;
              if (this.styleSettings.textAlign) {
                questionDiv.style.textAlign = this.styleSettings.textAlign;
              }
              questionDiv.style.display = i === 0 ? "block" : "none";
              questionDiv.style.transition = "transform 0.5s ease";

              this.questionsContainer.appendChild(questionDiv);

              const answers = question.node.answers.edges;
              answers.forEach((answer, j) => {
                const answerSpan = answerContainerTemplate.cloneNode(true);
                answerSpan.id = "answer_" + i + "_" + j;
                answerSpan.innerHTML =
                  `<span><button class="button answer" id="${answerSpan.id}">${answer.node.text}</button></span>`;
                const btn = answerSpan.querySelector("button");
                if (this.styleSettings.answerButtonColor) {
                  btn.style.backgroundColor = this.styleSettings.answerButtonColor;
                }
                if (this.styleSettings.borderWidth && this.styleSettings.borderColor) {
                  btn.style.border = `${this.styleSettings.borderWidth}px solid ${this.styleSettings.borderColor}`;
                }
                if (this.styleSettings.fontSize) {
                  btn.style.fontSize = this.styleSettings.fontSize + "px";
                }
                if (this.styleSettings.textAlign) {
                  btn.style.textAlign = this.styleSettings.textAlign;
                }
                answerSpan.addEventListener("click", (evt) => {
                  selectAnswer(evt, answer.node.id, answer.node.text);
                });
                this.querySelector(`.product-quiz__answers_${i}`).appendChild(answerSpan);
              });
            });

            this.slideToNextQuestion = () => {
              const questionElements = this.questionsContainer.children;
              if (this.currentQuestionIndex < questionElements.length - 1) {
                const currentQuestion = questionElements[this.currentQuestionIndex];

                currentQuestion.style.transform = "translateX(-100%)";
                setTimeout(() => {
                  currentQuestion.style.display = "none";
                  this.currentQuestionIndex++;
                  const nextQuestion = questionElements[this.currentQuestionIndex];
                  nextQuestion.style.display = "block";
                  nextQuestion.style.transform = "translateX(100%)";
                  setTimeout(() => {
                    nextQuestion.style.transition = "transform 0.5s ease";
                    nextQuestion.style.transform = "translateX(0)";
                  }, 50);
                }, 500);
              } else {
                console.log("Quiz complete");
              }
            };

            this.form.addEventListener("submit", async (evt) => {
              await onSubmitHandler(evt, quiz.id);
            });
          }
        }
      );
    }
  });
});